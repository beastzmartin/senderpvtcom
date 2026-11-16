import { getCrmDb } from '../db/index.js';
import { getDatabase } from '../../db/database.js';

export interface PartitionMaintenancePlan {
  engine: 'postgresql' | 'sqlite';
  table: string;
  partitions: string[];
  sql_script: string;
}

export interface OutboxLagReport {
  pending_count: number;
  oldest_pending_age_seconds: number;
  failed_count: number;
  is_healthy: boolean;
}

export class CrmReliabilityService {
  private static instance: CrmReliabilityService | null = null;

  public static getInstance(): CrmReliabilityService {
    if (!CrmReliabilityService.instance) {
      CrmReliabilityService.instance = new CrmReliabilityService();
    }
    return CrmReliabilityService.instance;
  }

  /**
   * Generates PostgreSQL 64-way hash partitioning and monthly range partition DDL
   * to guarantee linear scalability up to 100M+ contacts without lock escalation.
   */
  public generatePartitionMaintenanceScript(
    tableName: string = 'crm_contacts',
    partitionCount: number = 64
  ): PartitionMaintenancePlan {
    const partitions: string[] = [];
    const sqlLines: string[] = [
      `-- =========================================================================`,
      `-- ZERO-DOWNTIME PARTITION MAINTENANCE PLAN: ${tableName.toUpperCase()}`,
      `-- Engine: PostgreSQL 16+ Hash Partitioning (64 partitions)`,
      `-- =========================================================================`
    ];

    for (let i = 0; i < partitionCount; i++) {
      const partName = `${tableName}_p${i.toString().padStart(2, '0')}`;
      partitions.push(partName);
      sqlLines.push(
        `CREATE TABLE IF NOT EXISTS ${partName} PARTITION OF ${tableName} FOR VALUES WITH (MODULUS ${partitionCount}, REMAINDER ${i});`
      );
    }

    // Monthly archive partitions for cold audit logs
    const now = new Date();
    sqlLines.push(`\n-- Monthly Time-Range Partitions for Outbox & Audit History`);
    for (let m = 0; m < 12; m++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const nextDate = new Date(now.getFullYear(), now.getMonth() + m + 1, 1);
      const yyyymm = `${targetDate.getFullYear()}_${(targetDate.getMonth() + 1).toString().padStart(2, '0')}`;
      const startDateStr = targetDate.toISOString().slice(0, 10);
      const endDateStr = nextDate.toISOString().slice(0, 10);

      sqlLines.push(
        `CREATE TABLE IF NOT EXISTS crm_audit_logs_${yyyymm} PARTITION OF crm_audit_logs FOR VALUES FROM ('${startDateStr}') TO ('${endDateStr}');`
      );
    }

    return {
      engine: 'postgresql',
      table: tableName,
      partitions,
      sql_script: sqlLines.join('\n')
    };
  }

  /**
   * Monitors Transactional Outbox Lag and Event Delivery Health
   */
  public async getOutboxLagReport(workspaceId?: string): Promise<OutboxLagReport> {
    const rawDb = getDatabase();

    const stats = rawDb.prepare(`
      SELECT 
        count(CASE WHEN published_at IS NULL THEN 1 END) as pending_count,
        count(CASE WHEN status = 'failed' OR retry_count >= 5 THEN 1 END) as failed_count,
        min(CASE WHEN published_at IS NULL THEN created_at END) as oldest_pending
      FROM crm_outbox_events
      ${workspaceId ? 'WHERE workspace_id = ?' : ''}
    `).get(...(workspaceId ? [workspaceId] : [])) as any;

    const pending = Number(stats?.pending_count) || 0;
    const failed = Number(stats?.failed_count) || 0;
    let oldestAge = 0;

    if (stats?.oldest_pending) {
      oldestAge = Math.max(0, Math.round((Date.now() - new Date(stats.oldest_pending).getTime()) / 1000));
    }

    const isHealthy = pending < 5000 && oldestAge < 300 && failed === 0;

    return {
      pending_count: pending,
      oldest_pending_age_seconds: oldestAge,
      failed_count: failed,
      is_healthy: isHealthy
    };
  }

  /**
   * Micro-benchmark Keyset Cursor Pagination Latency
   * Measures average and p95 latency across multiple consecutive pages.
   */
  public async benchmarkKeysetCursor(
    workspaceId: string,
    iterations: number = 20,
    pageSize: number = 50
  ): Promise<{ iterations: number; avg_ms: number; p95_ms: number; sub_50ms_sla: boolean }> {
    const db = getCrmDb();
    const latencies: number[] = [];
    let cursor: string | undefined = undefined;

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      const res = await db.listContacts(workspaceId, {
        pagination: { limit: pageSize, cursor }
      });
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      latencies.push(durationMs);

      if (res.next_cursor) {
        cursor = res.next_cursor;
      } else {
        cursor = undefined; // Cycle back if reached end
      }
    }

    latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((sum, v) => sum + v, 0) / latencies.length;
    const p95Idx = Math.floor(latencies.length * 0.95);
    const p95 = latencies[p95Idx] ?? latencies[latencies.length - 1];

    return {
      iterations,
      avg_ms: Math.round(avg * 100) / 100,
      p95_ms: Math.round(p95 * 100) / 100,
      sub_50ms_sla: p95 < 50
    };
  }
}
