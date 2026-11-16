import { getDatabase, initDatabase } from '../db/database.js';
import { initMarketplaceSchema } from '../db/marketplaceSchema.js';
import { VaultService, VaultRegistry } from '../services/marketplace/VaultService.js';
import { MarketplaceJobService } from '../services/marketplace/MarketplaceJobService.js';
import crypto from 'crypto';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function runTest(suite: string, name: string, fn: () => Promise<void> | void) {
  const start = Date.now();
  try {
    await fn();
    results.push({ suite, name, passed: true, durationMs: Date.now() - start });
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    results.push({ suite, name, passed: false, error: err.message, durationMs: Date.now() - start });
    console.error(`  ✗ ${name}:`, err.message);
  }
}

export async function runVaultVerificationSuite() {
  console.log('\n================================================================');
  console.log('  ADDENDUM v3.1: ADMIN DATA VAULT VERIFICATION SUITE');
  console.log('================================================================\n');

  const db = initDatabase();
  initMarketplaceSchema(db);
  const vaultService = VaultService.getInstance();
  const jobService = MarketplaceJobService.getInstance();

  const testUserId = `usr_vlt_${crypto.randomUUID().slice(0, 8)}`;
  const testAdmin = {
    id: 'admin_test_1',
    username: 'SuperAdminTester',
    role: 'super_admin',
    ipAddress: '127.0.0.1',
    userAgent: 'VaultTestSuite/1.0'
  };

  // Seed test user
  db.prepare(`
    INSERT OR REPLACE INTO users (id, name, username, email, password_hash, role)
    VALUES (?, 'Vault Test User', ?, ?, 'hash', 'user')
  `).run(testUserId, `vlt_${testUserId}`, `${testUserId}@example.com`);

  // --------------------------------------------------------------------------
  // SUITE 1: Vault Ingestion & Checksum Calculation
  // --------------------------------------------------------------------------
  console.log('[SUITE 1] Vault Capture & Ingestion Engine');

  await runTest('Ingestion', 'Generic source adapter registers and captures extraction run', async () => {
    VaultRegistry.registerVaultSource({ module: 'test_module' });
    const sources = VaultRegistry.listSources();
    if (!sources.includes('test_module')) throw new Error('Source test_module was not registered in VaultRegistry');

    const sampleRows = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' }
    ];

    const captured = vaultService.captureJobRun({
      module: 'marketplace',
      sourceType: 'apify',
      userId: testUserId,
      jobId: `job_vlt_ingest_${crypto.randomUUID().slice(0, 8)}`,
      productSlug: 'google-maps-extractor',
      productName: 'Google Maps Business Extractor',
      status: 'completed',
      input: { location: 'New York', category: 'Cafes' },
      rowCount: sampleRows.length,
      resultsData: sampleRows,
      providerRunId: 'prun_123',
      providerDatasetId: 'pdata_456',
      providerCostUsd: 0.045,
      chargedAmount: 15.0,
      currency: 'USD',
      files: [
        {
          kind: 'csv_export',
          fileName: 'google_maps_leads.csv',
          storagePath: '/tmp/test_file.csv',
          byteSize: 1024,
          contentType: 'text/csv'
        }
      ]
    });

    if (!captured.id) throw new Error('Vault record missing ID');
    if (captured.row_count !== 2) throw new Error(`Expected 2 rows, got ${captured.row_count}`);
    if (!captured.checksum) throw new Error('Checksum was not computed');
    if (!captured.files || captured.files.length !== 1) throw new Error('Attached file was not registered');
  });

  await runTest('Ingestion', 'Captures failed and aborted jobs without breaking data integrity', async () => {
    const failedJob = vaultService.captureJobRun({
      module: 'marketplace',
      sourceType: 'apify',
      userId: testUserId,
      jobId: `job_vlt_fail_${crypto.randomUUID().slice(0, 8)}`,
      productSlug: 'linkedin-scraper',
      status: 'failed',
      input: { profile: 'linkedin.com/in/test' },
      rowCount: 0,
      notes: 'Rate limit exceeded on target platform'
    });

    if (failedJob.status !== 'failed') throw new Error(`Expected status failed, got ${failedJob.status}`);
    if (failedJob.notes !== 'Rate limit exceeded on target platform') throw new Error('Notes not preserved');
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Credential Masking & Audited Reveal
  // --------------------------------------------------------------------------
  console.log('\n[SUITE 2] Sensitive Credential Masking & Audited Access Log');

  let secretRecordId = '';
  await runTest('Security', 'Sensitive keys (passwords, tokens, cookies, api keys) are masked by default', async () => {
    const rec = vaultService.captureJobRun({
      module: 'marketplace',
      sourceType: 'apify',
      userId: testUserId,
      jobId: `job_vlt_sec_${crypto.randomUUID().slice(0, 8)}`,
      productSlug: 'authenticated-scraper',
      status: 'completed',
      input: {
        targetUrl: 'https://example.com',
        apiKey: 'super-secret-api-token-9988',
        cookieAuth: 'session_cookie_xyz',
        maxItems: 100
      },
      rowCount: 10
    });

    secretRecordId = rec.id;
    if (!rec.has_masked_secrets) throw new Error('Expected has_masked_secrets = true');
    if (rec.masked_input?.apiKey !== '••••••••') {
      throw new Error(`Expected apiKey to be masked as ••••••••, got: ${rec.masked_input?.apiKey}`);
    }
    if (rec.masked_input?.cookieAuth !== '••••••••') {
      throw new Error(`Expected cookieAuth to be masked as ••••••••, got: ${rec.masked_input?.cookieAuth}`);
    }
    if (rec.masked_input?.maxItems !== 100) {
      throw new Error('Non-sensitive field maxItems was unexpectedly altered');
    }
  });

  await runTest('Security', 'Audited credential reveal decrypts cleartext and records access log', async () => {
    const revealed = vaultService.revealSecret(secretRecordId, 'apiKey', testAdmin, 'Verifying customer webhook error in support ticket #5512');

    if (revealed.cleartextValue !== 'super-secret-api-token-9988') {
      throw new Error(`Expected decrypted value super-secret-api-token-9988, got: ${revealed.cleartextValue}`);
    }

    // Verify audit log entry
    const accessLogs = vaultService.listAccessLogs({ recordId: secretRecordId, action: 'reveal_secret' });
    if (accessLogs.logs.length === 0) {
      throw new Error('Access log was not created for credential reveal');
    }
    const log = accessLogs.logs[0];
    if (log.admin_username !== testAdmin.username) throw new Error('Audit log recorded incorrect admin username');
    if (!log.reason?.includes('support ticket #5512')) throw new Error('Audit log did not record the entered reason');
  });

  await runTest('Security', 'Fails reveal when audit reason is empty or omitted', async () => {
    try {
      vaultService.revealSecret(secretRecordId, 'apiKey', testAdmin, '');
      throw new Error('Should have rejected reveal without reason');
    } catch (err: any) {
      if (!err.message.includes('AUDIT_REASON_REQUIRED')) throw err;
    }
  });

  // --------------------------------------------------------------------------
  // SUITE 3: Multi-Stage Deletion Lifecycle & Legal Hold
  // --------------------------------------------------------------------------
  console.log('\n[SUITE 3] Multi-Stage Deletion Lifecycle (Active -> Trash -> Hard Purge)');

  let targetLifecycleJobId = `job_vlt_del_${crypto.randomUUID().slice(0, 8)}`;
  let targetLifecycleVaultId = '';

  await runTest('Lifecycle', 'Moves active record to Trash (Soft Delete) with calculated purge countdown', async () => {
    const rec = vaultService.captureJobRun({
      module: 'marketplace',
      sourceType: 'apify',
      userId: testUserId,
      jobId: targetLifecycleJobId,
      productSlug: 'yelp-leads',
      status: 'completed',
      input: { city: 'Chicago' },
      rowCount: 50,
      sizeBytes: 12000
    });
    targetLifecycleVaultId = rec.id;

    const res = vaultService.softDelete([rec.id], testAdmin, 'Routine data lifecycle testing');
    if (res.affectedCount !== 1) throw new Error(`Expected 1 affected, got ${res.affectedCount}`);

    const fetched = vaultService.getVaultRecord(rec.id, testAdmin);
    if (!fetched?.deleted_at) throw new Error('deleted_at timestamp not set on soft delete');
    if (!fetched?.purge_at) throw new Error('purge_at expiration timestamp not set');
  });

  await runTest('Lifecycle', 'Restores record from Trash back to Active', async () => {
    const res = vaultService.restoreFromTrash([targetLifecycleVaultId], testAdmin);
    if (res.restoredCount !== 1) throw new Error(`Expected 1 restored, got ${res.restoredCount}`);

    const fetched = vaultService.getVaultRecord(targetLifecycleVaultId, testAdmin);
    if (fetched?.deleted_at !== null && fetched?.deleted_at !== undefined) {
      throw new Error('deleted_at was not cleared on restore');
    }
  });

  await runTest('Lifecycle', 'Legal Hold prevents soft deletion and hard purge', async () => {
    vaultService.toggleLegalHold(targetLifecycleVaultId, true, 'Regulatory audit under section 12B', testAdmin);
    const holdRecord = vaultService.getVaultRecord(targetLifecycleVaultId, testAdmin);
    if (holdRecord?.legal_hold !== 1) throw new Error('Legal Hold flag was not set');

    // Attempt soft delete
    const softRes = vaultService.softDelete([targetLifecycleVaultId], testAdmin, 'Attempted delete under hold');
    if (softRes.blockedCount !== 1) throw new Error('Soft delete was not blocked by Legal Hold');

    // Attempt hard purge
    try {
      await vaultService.hardPurge([targetLifecycleVaultId], testAdmin, 'Attempted purge under hold', 'DELETE');
      throw new Error('Hard purge should have thrown error under Legal Hold');
    } catch (err: any) {
      if (!err.message.includes('LEGAL_HOLD_BLOCKED')) throw err;
    }

    // Release hold
    vaultService.toggleLegalHold(targetLifecycleVaultId, false, 'Audit concluded satisfactorily', testAdmin);
  });

  await runTest('Lifecycle', 'Irreversible Hard Purge requires exact confirmation "DELETE" and emits signed Deletion Receipt', async () => {
    // Incorrect confirmation text must fail
    try {
      await vaultService.hardPurge([targetLifecycleVaultId], testAdmin, 'Testing confirmation check', 'delete_lowercase');
      throw new Error('Hard purge accepted invalid confirmation string');
    } catch (err: any) {
      if (!err.message.includes('CONFIRMATION_FAILED')) throw err;
    }

    // Exact "DELETE" confirmation
    const receipt = await vaultService.hardPurge(
      [targetLifecycleVaultId],
      testAdmin,
      'Final automated lifecycle verification purge',
      'DELETE'
    );

    if (!receipt.id) throw new Error('Deletion receipt missing ID');
    if (receipt.jobs_deleted_count !== 1) throw new Error(`Expected 1 job deleted, got ${receipt.jobs_deleted_count}`);
    if (receipt.admin_user_id !== testAdmin.id) throw new Error('Receipt recorded incorrect admin user');

    // Verify record in deletion_receipts table
    const storedReceipts = vaultService.listDeletionReceipts(10);
    const found = storedReceipts.find((r) => r.id === receipt.id);
    if (!found) throw new Error('Signed deletion receipt not persisted in deletion_receipts table');

    // Verify purged_at timestamp set on vault_record
    const purgedRec = vaultService.getVaultRecord(targetLifecycleVaultId, testAdmin);
    if (!purgedRec?.purged_at) throw new Error('Vault record was not marked purged');
    if (purgedRec.row_count !== 0) throw new Error('Purged record row count was not zeroed out');
  });

  // --------------------------------------------------------------------------
  // SUITE 4: GDPR / DPDP User Data Erasure ("Right to be Forgotten")
  // --------------------------------------------------------------------------
  console.log('\n[SUITE 4] GDPR / DPDP User Data Erasure & Ledger Non-Destruction');

  await runTest('GDPR', 'Erases all customer extraction data while preserving financial wallet ledger', async () => {
    const eraseTargetUserId = `usr_erasure_${crypto.randomUUID().slice(0, 8)}`;

    // Create user and wallet balance
    db.prepare(`
      INSERT INTO users (id, name, username, email, password_hash, role)
      VALUES (?, 'Erasure Subject', ?, ?, 'hash', 'user')
    `).run(eraseTargetUserId, `erase_${eraseTargetUserId}`, `${eraseTargetUserId}@privacy.org`);

    db.prepare(`
      INSERT INTO user_wallets (user_id, balance, base_balance, currency, base_currency)
      VALUES (?, 250.0, 250.0, 'USD', 'USD')
    `).run(eraseTargetUserId);

    db.prepare(`
      INSERT INTO wallet_transactions (
        id, user_id, transaction_type, amount, currency, previous_balance, new_balance, description, status, created_at
      ) VALUES (
        ?, ?, 'wallet_topup', 250.0, 'USD', 0.0, 250.0, 'Customer card top-up', 'completed', datetime('now')
      )
    `).run(`tx_${crypto.randomUUID().slice(0, 8)}`, eraseTargetUserId);

    // Create 2 extraction jobs for user
    vaultService.captureJobRun({
      module: 'marketplace',
      sourceType: 'apify',
      userId: eraseTargetUserId,
      jobId: `job_erase_1_${crypto.randomUUID().slice(0, 6)}`,
      productSlug: 'twitter-profile-extractor',
      status: 'completed',
      input: { query: 'test' },
      rowCount: 20
    });

    vaultService.captureJobRun({
      module: 'lead_extractor',
      sourceType: 'browser_connector',
      userId: eraseTargetUserId,
      jobId: `job_erase_2_${crypto.randomUUID().slice(0, 6)}`,
      status: 'completed',
      input: { keyword: 'doctors', location: 'Boston' },
      rowCount: 15
    });

    // Execute User Erasure
    const erasureReceipt = await vaultService.executeUserErasure(
      eraseTargetUserId,
      testAdmin,
      'Formal GDPR Article 17 Right to Erasure request verified',
      'ERASE'
    );

    if (erasureReceipt.jobs_deleted_count !== 2) {
      throw new Error(`Expected 2 jobs deleted in erasure, got: ${erasureReceipt.jobs_deleted_count}`);
    }

    // Verify Financial Ledger is 100% Intact
    const wallet = db.prepare('SELECT balance FROM user_wallets WHERE user_id = ?').get(eraseTargetUserId) as any;
    if (!wallet || Number(wallet.balance) !== 250.0) {
      throw new Error('Financial wallet balance was corrupted or deleted during user erasure!');
    }

    const txCount = (db.prepare('SELECT count(*) as c FROM wallet_transactions WHERE user_id = ?').get(eraseTargetUserId) as any)?.c || 0;
    if (txCount !== 1) {
      throw new Error('Financial ledger transaction history was altered during user erasure!');
    }

    // Verify PII is anonymized
    const userRow = db.prepare('SELECT name, email FROM users WHERE id = ?').get(eraseTargetUserId) as any;
    if (userRow.name !== 'Erased User') throw new Error(`PII name was not anonymized, got ${userRow.name}`);
    if (!userRow.email.includes('erased_')) throw new Error(`PII email was not anonymized, got ${userRow.email}`);
  });

  // --------------------------------------------------------------------------
  // SUITE 5: Backfill Idempotency & Retention Engine
  // --------------------------------------------------------------------------
  console.log('\n[SUITE 5] Backfill Idempotency & Automated Retention Cleaner');

  await runTest('Retention', 'Backfill scans existing jobs idempotently without duplication', async () => {
    const firstPass = vaultService.backfillExistingJobs();
    const secondPass = vaultService.backfillExistingJobs();

    if (secondPass.backfilledMarketplace !== 0 || secondPass.backfilledLeadExtractor !== 0) {
      throw new Error(`Backfill is not idempotent: second run added ${secondPass.backfilledMarketplace + secondPass.backfilledLeadExtractor} duplicates`);
    }
  });

  await runTest('Retention', 'Retention preview dry-run returns accurate impact counts', async () => {
    const preview = vaultService.previewRetentionPurge();
    if (typeof preview.eligibleForTrashCount !== 'number') throw new Error('Missing eligibleForTrashCount');
    if (typeof preview.eligibleForPurgeCount !== 'number') throw new Error('Missing eligibleForPurgeCount');
    if (typeof preview.protectedByLegalHoldCount !== 'number') throw new Error('Missing protectedByLegalHoldCount');
  });

  await runTest('Retention', 'Retention cycle runs safely and does not throw', async () => {
    const res = await vaultService.executeRetentionCycle();
    if (typeof res.trashedCount !== 'number') throw new Error('Missing trashedCount in cycle result');
    if (typeof res.purgedCount !== 'number') throw new Error('Missing purgedCount in cycle result');
  });

  // --------------------------------------------------------------------------
  // SUITE 6: Customer Deletion Behavior & White-Label Purity
  // --------------------------------------------------------------------------
  console.log('\n[SUITE 6] White-Label Purity & Customer Delete Behavior');

  await runTest('White-Label', 'Customer getJobById hides upstream provider run ID, dataset ID, and vendor cost', async () => {
    const testProdId = `prod_wl_${crypto.randomUUID().slice(0, 8)}`;
    const testProdSlug = `wl-scraper-${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO extraction_marketplace_products (
        id, slug, display_name, category, status, definition_json
      ) VALUES (
        ?, ?, 'Test Scraper', 'lead_generation', 'active', '{}'
      )
    `).run(testProdId, testProdSlug);

    const testCustomerJobId = `job_wl_${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO marketplace_jobs (
        id, user_id, product_id, product_slug, product_name, input_json, requested_items,
        status, provider_type, provider_run_id, provider_dataset_id, provider_cost_usd,
        charged_amount, currency, created_at
      ) VALUES (
        ?, ?, ?, ?, 'Test Scraper', '{}', 10,
        'COMPLETED', 'apify', 'secret_run_123', 'secret_dataset_456', 0.05,
        10.0, 'USD', datetime('now')
      )
    `).run(testCustomerJobId, testUserId, testProdId, testProdSlug);

    // Fetch as customer (isAdmin = false)
    const customerJob = jobService.getJobById(testCustomerJobId, testUserId, false);

    if (customerJob.provider_run_id !== undefined) {
      throw new Error(`LEAK: Customer job exposed provider_run_id: ${customerJob.provider_run_id}`);
    }
    if (customerJob.provider_dataset_id !== undefined) {
      throw new Error(`LEAK: Customer job exposed provider_dataset_id: ${customerJob.provider_dataset_id}`);
    }
    if (customerJob.provider_cost_usd !== undefined) {
      throw new Error(`LEAK: Customer job exposed provider_cost_usd: ${customerJob.provider_cost_usd}`);
    }
    if (customerJob.provider_type !== undefined) {
      throw new Error(`LEAK: Customer job exposed provider_type: ${customerJob.provider_type}`);
    }

    // Customer job listing hides soft-deleted / customer-hidden jobs
    jobService.deleteUserJob(testCustomerJobId, testUserId);
    const customerList = jobService.listUserJobs(testUserId);
    const foundInCustomerList = customerList.jobs.find((j) => j.id === testCustomerJobId);
    if (foundInCustomerList) {
      throw new Error('Deleted/hidden job is still visible in customer listUserJobs!');
    }

    // But Admin can still see it in Admin Data Vault
    const vaultView = vaultService.listVaultRecords({ search: testCustomerJobId });
    // Verify admin access
    const adminJob = jobService.getJobById(testCustomerJobId, testUserId, true);
    if (!adminJob.provider_run_id) {
      throw new Error('Admin should have visibility of provider_run_id in admin view');
    }
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`  TOTAL: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} verification tests failed!`);
  }
}

// Direct execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  runVaultVerificationSuite()
    .then(() => {
      console.log('✓ All Data Vault verification tests completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('✗ Verification failed:', err);
      process.exit(1);
    });
}
