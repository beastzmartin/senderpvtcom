import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { initCrmDatabase, getCrmDb } from '../src/crm/db/index.js';
import { CrmReliabilityService } from '../src/crm/services/CrmReliabilityService.js';
import { getDatabase } from '../src/db/database.js';

describe('CRM V2 Phase 11: Reliability, Disaster Recovery & 100M Scale Verification', () => {
  let wsId: string;
  const reliability = CrmReliabilityService.getInstance();

  before(async () => {
    const crmDb = await initCrmDatabase();
    const rawDb = getDatabase();

    const existingUser = rawDb.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
    const userId = existingUser ? existingUser.id : 'user_scale_test_' + Date.now();
    if (!existingUser) {
      rawDb.prepare(`INSERT INTO users (id, username, password_hash, role) VALUES (?, 'scaletester', 'pwd', 'admin')`).run(userId);
    }

    const ws = await crmDb.createWorkspace(userId, 'Scale Verification WS ' + Date.now());
    wsId = ws.id;

    // Seed 100 contacts to benchmark keyset pagination
    const insertContact = rawDb.prepare(`
      INSERT INTO crm_contacts (
        id, workspace_id, first_name, last_name, email, email_normalized, phone, phone_e164, country, source, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', datetime('now', '-' || ? || ' minutes'), datetime('now'))
    `);

    const tx = rawDb.transaction(() => {
      for (let i = 0; i < 100; i++) {
        const id = `scale_c_${i}_${Date.now()}`;
        const email = `contact${i}@scale-test.com`;
        const phone = `+1415555${(1000 + i).toString()}`;
        insertContact.run(
          id,
          wsId,
          `First${i}`,
          `Last${i}`,
          email,
          email,
          phone,
          phone,
          i % 2 === 0 ? 'India' : 'United States',
          'synthetic_benchmark',
          i
        );
      }
    });

    tx();
  });

  it('benchmarks indexed keyset cursor pagination with sub-50ms latency SLA', async () => {
    const report = await reliability.benchmarkKeysetCursor(wsId, 25, 10);

    console.log(`\n  ⚡ Keyset Cursor Latency Benchmark Results:`);
    console.log(`     - Iterations: ${report.iterations} pages`);
    console.log(`     - Average Latency: ${report.avg_ms} ms`);
    console.log(`     - p95 Latency: ${report.p95_ms} ms`);
    console.log(`     - Sub-50ms SLA: ${report.sub_50ms_sla ? 'MET ✅' : 'FAILED ❌'}\n`);

    assert.ok(report.iterations >= 25, 'Ran full iteration count');
    assert.ok(report.avg_ms < 50, `Average latency (${report.avg_ms}ms) must be under 50ms`);
    assert.strictEqual(report.sub_50ms_sla, true, 'p95 latency satisfies sub-50ms SLA');
  });

  it('generates 64-way hash partitioning and 12-month range maintenance plan', () => {
    const plan = reliability.generatePartitionMaintenanceScript('crm_contacts', 64);

    assert.strictEqual(plan.engine, 'postgresql');
    assert.strictEqual(plan.table, 'crm_contacts');
    assert.strictEqual(plan.partitions.length, 64, 'Must generate exactly 64 hash partitions');
    assert.ok(plan.sql_script.includes('crm_contacts_p00'), 'Includes partition 00');
    assert.ok(plan.sql_script.includes('crm_contacts_p63'), 'Includes partition 63');
    assert.ok(plan.sql_script.includes('crm_audit_logs_'), 'Includes monthly audit logs range partitions');
  });

  it('monitors transactional outbox lag and event health', async () => {
    const lag = await reliability.getOutboxLagReport(wsId);

    assert.ok(typeof lag.pending_count === 'number', 'Has pending_count');
    assert.ok(typeof lag.oldest_pending_age_seconds === 'number', 'Has oldest_pending_age_seconds');
    assert.strictEqual(lag.is_healthy, true, 'Outbox pipeline is healthy');
  });
});
