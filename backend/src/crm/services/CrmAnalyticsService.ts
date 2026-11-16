import { getCrmDb } from '../db/index.js';
import {
  FunnelMetrics,
  AttributionSummary,
  CohortRow,
  CustomReportSpec,
  CustomReportResult
} from '../models/types.js';

export class CrmAnalyticsService {
  private static instance: CrmAnalyticsService | null = null;

  public static getInstance(): CrmAnalyticsService {
    if (!CrmAnalyticsService.instance) {
      CrmAnalyticsService.instance = new CrmAnalyticsService();
    }
    return CrmAnalyticsService.instance;
  }

  /**
   * Pipeline Funnel Analysis: stage conversions, drop-offs, win rates, velocity
   */
  public async getFunnelMetrics(workspaceId: string, pipelineId?: string): Promise<FunnelMetrics> {
    const db = getCrmDb();
    return db.getFunnelMetrics(workspaceId, pipelineId);
  }

  /**
   * Attribution Modeling: first-touch and last-touch analysis by channel/source
   */
  public async getAttributionMetrics(workspaceId: string): Promise<AttributionSummary> {
    const db = getCrmDb();
    return db.getAttributionMetrics(workspaceId);
  }

  /**
   * Cohort Retention: track engagement across 30/60/90/120 day windows by creation month
   */
  public async getCohortRetention(workspaceId: string, months: number = 6): Promise<CohortRow[]> {
    const db = getCrmDb();
    return db.getCohortRetention(workspaceId, months);
  }

  /**
   * Custom Report Builder: multi-dimensional report generator with charts
   */
  public async runCustomReport(workspaceId: string, spec: CustomReportSpec): Promise<CustomReportResult> {
    const db = getCrmDb();
    return db.runCustomReport(workspaceId, spec);
  }

  /**
   * Export custom report as RFC-4180 CSV
   */
  public exportReportCsv(report: CustomReportResult): string {
    if (!report || !report.rows || report.rows.length === 0) {
      return `${report.dimension}\n`;
    }

    // Determine metric keys from first row
    const metricKeys = Object.keys(report.rows[0]?.metrics || {});
    const header = [report.dimension, ...metricKeys].map(h => `"${h.replace(/"/g, '""')}"`).join(',');

    const lines = [header];
    for (const r of report.rows) {
      const rowVals = [
        `"${String(r.dimension_value || '').replace(/"/g, '""')}"`,
        ...metricKeys.map(k => String(r.metrics[k] ?? 0))
      ];
      lines.push(rowVals.join(','));
    }

    return lines.join('\n');
  }
}

