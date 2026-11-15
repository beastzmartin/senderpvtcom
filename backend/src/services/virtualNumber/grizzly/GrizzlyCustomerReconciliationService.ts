import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import {
  GrizzlyCustomerApiClient,
  GrizzlyActiveActivationsResult,
  GrizzlyRemoteActiveActivation
} from './GrizzlyCustomerApiClient.js';
import { GrizzlyCustomerConfigService } from './GrizzlyCustomerConfigService.js';
import { WalletService } from '../../walletService.js';

export interface ReconciliationRunSummary {
  runId: string;
  totalRemote: number;
  totalLocal: number;
  matchedCount: number;
  missingLocallyCount: number;
  missingRemotelyCount: number;
  discrepancyCount: number;
  durationMs: number;
  status: 'completed' | 'failed';
  errorMessage?: string;
  createdAt: string;
}

export interface ReconciliationRecordItem {
  id: string;
  runId: string;
  providerActivationId: string;
  localActivationId?: string;
  userId?: string;
  phoneNumber?: string;
  serviceCode?: string;
  countryCode?: string;
  providerCost?: number;
  localCost?: number;
  providerStatus?: string;
  localStatus?: string;
  discrepancyType: 'matched' | 'missing_locally' | 'missing_remotely' | 'status_mismatch' | 'cost_mismatch' | 'requires_review';
  resolutionStatus: 'pending' | 'resolved' | 'ignored';
  resolutionNotes?: string;
  reconciledAt: string;
}

export class GrizzlyCustomerReconciliationService {
  private static isReconciling = false;
  private static walletService = WalletService.getInstance();

  /**
   * Run full reconciliation between GrizzlySMS remote active activations and local database
   */
  public static async runReconciliation(): Promise<{
    success: boolean;
    summary?: ReconciliationRunSummary;
    error?: string;
  }> {
    if (this.isReconciling) {
      return {
        success: false,
        error: 'Reconciliation is already running. Please wait for the current job to complete.'
      };
    }

    this.isReconciling = true;
    const startTime = Date.now();
    const runId = `recon_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const db = getDatabase();
    const config = GrizzlyCustomerConfigService.getConfig(false);

    try {
      // 1. Fetch remote active activations
      const remoteRes: GrizzlyActiveActivationsResult = await GrizzlyCustomerApiClient.getActiveActivations(config.api_key);

      if (!remoteRes.success) {
        throw new Error(remoteRes.error || 'Provider returned error during getActiveActivations');
      }

      const remoteActivations = remoteRes.activations;
      const remoteMap = new Map<string, GrizzlyRemoteActiveActivation>();
      for (const ra of remoteActivations) {
        remoteMap.set(String(ra.activationId), ra);
      }

      // 2. Load all local pending or active customer activations
      const localActivations = db.prepare(`
        SELECT * FROM grizzly_customer_activations
        WHERE status IN ('NUMBER_ASSIGNED', 'WAITING_SMS')
           OR created_at >= datetime('now', '-24 hours')
      `).all() as any[];

      const localMap = new Map<string, any>();
      for (const la of localActivations) {
        if (la.provider_activation_id && la.provider_activation_id !== 'NONE') {
          localMap.set(String(la.provider_activation_id), la);
        }
      }

      let matchedCount = 0;
      let missingLocallyCount = 0;
      let missingRemotelyCount = 0;
      let discrepancyCount = 0;

      // 3. Insert initial run record so foreign key constraints on reconciliation_records are satisfied
      db.prepare(`
        INSERT INTO grizzly_reconciliation_runs (
          id, total_remote, total_local, matched_count, missing_locally_count,
          missing_remotely_count, discrepancy_count, status, run_duration_ms, created_at
        ) VALUES (?, ?, ?, 0, 0, 0, 0, 'running', 0, datetime('now'))
      `).run(runId, remoteActivations.length, localActivations.length);

      const recordStmt = db.prepare(`
        INSERT INTO grizzly_reconciliation_records (
          id, run_id, provider_activation_id, local_activation_id, user_id,
          phone_number, service_code, country_code, provider_cost, local_cost,
          provider_status, local_status, discrepancy_type, resolution_status,
          resolution_notes, reconciled_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, datetime('now')
        )
      `);

      const updateLocalStmt = db.prepare(`
        UPDATE grizzly_customer_activations
        SET provider_acquisition_cost = COALESCE(?, provider_acquisition_cost),
            currency_numeric = COALESCE(?, currency_numeric),
            can_get_another_sms = COALESCE(?, can_get_another_sms),
            discount = COALESCE(?, discount),
            repeated = COALESCE(?, repeated),
            reconciliation_status = 'matched',
            last_reconciled_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `);

      // 3. Process remote activations vs local
      for (const remote of remoteActivations) {
        const local = localMap.get(remote.activationId);

        if (!local) {
          // Missing Locally: exists in Grizzly active list but not found in our customer activations
          missingLocallyCount++;
          discrepancyCount++;
          recordStmt.run(
            crypto.randomUUID(),
            runId,
            remote.activationId,
            null,
            null,
            remote.phoneNumber,
            remote.serviceCode,
            remote.countryCode,
            remote.activationCost,
            0.0,
            String(remote.activationStatus),
            'NONE',
            'missing_locally',
            'pending',
            'Activation present on provider active list but missing in platform customer database.'
          );
        } else {
          // Both present: verify costs and status
          let isMismatch = false;
          let discType: 'matched' | 'cost_mismatch' | 'status_mismatch' = 'matched';
          let notes = 'Synced and matched with remote active activation.';

          // Cost comparison
          if (local.provider_acquisition_cost > 0 && Math.abs(local.provider_acquisition_cost - remote.activationCost) > 0.05) {
            isMismatch = true;
            discType = 'cost_mismatch';
            notes = `Cost discrepancy: Local ₹${local.provider_acquisition_cost} vs Provider ₹${remote.activationCost}`;
          }

          if (isMismatch) {
            discrepancyCount++;
          } else {
            matchedCount++;
          }

          // Update local record metadata
          updateLocalStmt.run(
            remote.activationCost,
            typeof remote.currency === 'number' ? remote.currency : 643,
            remote.canGetAnotherSms,
            remote.discount,
            remote.repeated,
            local.id
          );

          recordStmt.run(
            crypto.randomUUID(),
            runId,
            remote.activationId,
            local.id,
            local.user_id,
            remote.phoneNumber || local.phone_number,
            remote.serviceCode || local.service_code,
            remote.countryCode || local.country_id,
            remote.activationCost,
            local.provider_acquisition_cost,
            String(remote.activationStatus),
            local.status,
            discType,
            isMismatch ? 'pending' : 'resolved',
            notes
          );
        }
      }

      // 4. Process local active activations absent from remote list
      // IMPORTANT: Absence from getActiveActivations does not prove completion/refund.
      // We safely call getStatusV2 to investigate instead of blind cancellations.
      for (const [providerId, local] of localMap.entries()) {
        if (!remoteMap.has(providerId) && ['NUMBER_ASSIGNED', 'WAITING_SMS'].includes(local.status)) {
          missingRemotelyCount++;
          discrepancyCount++;

          let resolutionNotes = 'Local activation absent from remote active activations list. Safe status verification triggered.';
          let resolvedStatus = 'pending';

          try {
            // Verify status safely
            const statusCheck = await GrizzlyCustomerApiClient.getStatusV2(providerId, config.api_key);
            if (statusCheck.hasSms && statusCheck.sms) {
              // SMS arrived remotely! Complete locally
              db.prepare(`
                UPDATE grizzly_customer_activations
                SET status = 'COMPLETED',
                    sms_code = ?,
                    sms_text = ?,
                    verification_type = ?,
                    sms_status = 'RECEIVED',
                    completed_at = datetime('now'),
                    last_reconciled_at = datetime('now'),
                    updated_at = datetime('now')
                WHERE id = ?
              `).run(
                statusCheck.sms.code,
                statusCheck.sms.text,
                statusCheck.verificationType || 1,
                local.id
              );
              resolutionNotes = `SMS received during safe reconciliation verification (${statusCheck.sms.code}). Local state completed.`;
              resolvedStatus = 'resolved';
            } else if (statusCheck.status === 'CANCELLED') {
              // Provider confirmed cancellation
              db.prepare(`
                UPDATE grizzly_customer_activations
                SET status = 'CANCELLED',
                    cancelled_at = datetime('now'),
                    last_reconciled_at = datetime('now'),
                    updated_at = datetime('now')
                WHERE id = ?
              `).run(local.id);

              // Refund wallet safely
              this.walletService.refund(
                local.user_id,
                local.customer_selling_price,
                `Reconciliation Refund: Cancelled Activation +${local.phone_number}`,
                local.wallet_transaction_id
              );
              resolutionNotes = 'Provider confirmed activation was cancelled. User wallet safely refunded.';
              resolvedStatus = 'resolved';
            } else {
              resolutionNotes = `Absence confirmed. Status check returned: ${statusCheck.status}. Retaining local state for review.`;
            }
          } catch (err: any) {
            resolutionNotes += ` Status check error: ${err.message}`;
          }

          recordStmt.run(
            crypto.randomUUID(),
            runId,
            providerId,
            local.id,
            local.user_id,
            local.phone_number,
            local.service_code,
            local.country_id,
            local.provider_acquisition_cost,
            local.provider_acquisition_cost,
            'ABSENT',
            local.status,
            'missing_remotely',
            resolvedStatus,
            resolutionNotes
          );
        }
      }

      const durationMs = Date.now() - startTime;
      const nowIso = new Date().toISOString();

      // 5. Update Run Record to completed
      db.prepare(`
        UPDATE grizzly_reconciliation_runs
        SET total_remote = ?,
            total_local = ?,
            matched_count = ?,
            missing_locally_count = ?,
            missing_remotely_count = ?,
            discrepancy_count = ?,
            status = 'completed',
            run_duration_ms = ?
        WHERE id = ?
      `).run(
        remoteActivations.length,
        localActivations.length,
        matchedCount,
        missingLocallyCount,
        missingRemotelyCount,
        discrepancyCount,
        durationMs,
        runId
      );

      // Update config with last reconciliation time
      db.prepare(`
        UPDATE grizzly_customer_config
        SET last_reconciliation_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = 'default'
      `).run();

      const summary: ReconciliationRunSummary = {
        runId,
        totalRemote: remoteActivations.length,
        totalLocal: localActivations.length,
        matchedCount,
        missingLocallyCount,
        missingRemotelyCount,
        discrepancyCount,
        durationMs,
        status: 'completed',
        createdAt: nowIso
      };

      return { success: true, summary };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const existing = db.prepare('SELECT id FROM grizzly_reconciliation_runs WHERE id = ?').get(runId);
      if (existing) {
        db.prepare(`
          UPDATE grizzly_reconciliation_runs
          SET status = 'failed',
              error_message = ?,
              run_duration_ms = ?
          WHERE id = ?
        `).run(err.message, durationMs, runId);
      } else {
        db.prepare(`
          INSERT INTO grizzly_reconciliation_runs (
            id, total_remote, total_local, matched_count, missing_locally_count,
            missing_remotely_count, discrepancy_count, status, error_message, run_duration_ms, created_at
          ) VALUES (?, 0, 0, 0, 0, 0, 0, 'failed', ?, ?, datetime('now'))
        `).run(runId, err.message, durationMs);
      }

      return {
        success: false,
        error: err.message || 'Reconciliation failed'
      };
    } finally {
      this.isReconciling = false;
    }
  }

  /**
   * Get reconciliation runs history
   */
  public static getRuns(limit = 20, offset = 0): { total: number; runs: ReconciliationRunSummary[] } {
    const db = getDatabase();
    const total = (db.prepare('SELECT COUNT(*) as c FROM grizzly_reconciliation_runs').get() as any)?.c || 0;
    const rows = db.prepare(`
      SELECT * FROM grizzly_reconciliation_runs
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    return {
      total,
      runs: rows.map((r) => ({
        runId: r.id,
        totalRemote: r.total_remote,
        totalLocal: r.total_local,
        matchedCount: r.matched_count,
        missingLocallyCount: r.missing_locally_count,
        missingRemotelyCount: r.missing_remotely_count,
        discrepancyCount: r.discrepancy_count,
        durationMs: r.run_duration_ms,
        status: r.status,
        errorMessage: r.error_message,
        createdAt: r.created_at
      }))
    };
  }

  /**
   * Get reconciliation discrepancy records with filtering
   */
  public static getRecords(filter?: {
    runId?: string;
    discrepancyType?: string;
    resolutionStatus?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): { total: number; records: ReconciliationRecordItem[] } {
    const db = getDatabase();
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;

    let query = 'FROM grizzly_reconciliation_records WHERE 1=1';
    const params: any[] = [];

    if (filter?.runId) {
      query += ' AND run_id = ?';
      params.push(filter.runId);
    }
    if (filter?.discrepancyType && filter.discrepancyType !== 'all') {
      query += ' AND discrepancy_type = ?';
      params.push(filter.discrepancyType);
    }
    if (filter?.resolutionStatus && filter.resolutionStatus !== 'all') {
      query += ' AND resolution_status = ?';
      params.push(filter.resolutionStatus);
    }
    if (filter?.search) {
      query += ' AND (provider_activation_id LIKE ? OR phone_number LIKE ? OR user_id LIKE ?)';
      params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
    }

    const total = (db.prepare(`SELECT COUNT(*) as c ${query}`).get(...params) as any)?.c || 0;
    const rows = db.prepare(`SELECT * ${query} ORDER BY reconciled_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as any[];

    return {
      total,
      records: rows.map((r) => ({
        id: r.id,
        runId: r.run_id,
        providerActivationId: r.provider_activation_id,
        localActivationId: r.local_activation_id,
        userId: r.user_id,
        phoneNumber: r.phone_number,
        serviceCode: r.service_code,
        countryCode: r.country_code,
        providerCost: r.provider_cost,
        localCost: r.local_cost,
        providerStatus: r.provider_status,
        localStatus: r.local_status,
        discrepancyType: r.discrepancy_type,
        resolutionStatus: r.resolution_status,
        resolutionNotes: r.resolution_notes,
        reconciledAt: r.reconciled_at
      }))
    };
  }

  /**
   * Manually resolve or ignore a reconciliation record
   */
  public static resolveRecord(recordId: string, action: 'resolve' | 'ignore', notes?: string): boolean {
    const db = getDatabase();
    const resolutionStatus = action === 'resolve' ? 'resolved' : 'ignored';
    const res = db.prepare(`
      UPDATE grizzly_reconciliation_records
      SET resolution_status = ?,
          resolution_notes = CASE WHEN ? IS NOT NULL THEN ? ELSE resolution_notes END
      WHERE id = ?
    `).run(resolutionStatus, notes || null, notes || null, recordId);

    return res.changes > 0;
  }
}
