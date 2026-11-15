import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import { GrizzlyHardwareCapacityService } from './GrizzlyHardwareCapacityService.js';
import { GrizzlyPartnerProtocolService } from './GrizzlyPartnerProtocolService.js';
import { GRIZZLY_STATUS, GrizzlyFinishActivationCallback } from './types.js';

export class GrizzlyFinishActivationAdapter {
  /**
   * Process FINISH_ACTIVATION callback according to official GrizzlySMS status table:
   * Status 1: Number issuance prohibited
   * Status 3: Successfully sold (reward once, hardware slot released)
   * Status 4: Activation cancelled (atomic counter; blacklist at >= 5 cancellations)
   * Status 5: Activation returned (quarantine, refund in accounting)
   *
   * Idempotent: Repeated callbacks return SUCCESS without repeating financial or duplicate operations.
   */
  public async finishActivation(data: any): Promise<{ status: 'SUCCESS' | 'ERROR'; error?: string }> {
    return this.handleCallback(data);
  }

  public async handleCallback(callback: GrizzlyFinishActivationCallback): Promise<{ status: 'SUCCESS' | 'ERROR'; error?: string }> {
    const db = getDatabase();
    const activationId = parseInt(String(callback.activationId), 10);
    const grizzlyStatus = parseInt(String(callback.status), 10);

    if (isNaN(activationId) || isNaN(grizzlyStatus)) {
      return { status: 'ERROR', error: 'Invalid activationId or status code.' };
    }

    const activation = db.prepare(`
      SELECT * FROM grizzly_activations WHERE activation_id = ?
    `).get(activationId) as any;

    if (!activation) {
      return { status: 'ERROR', error: `Activation #${activationId} not found.` };
    }

    // IDEMPOTENCY CHECK:
    // If this activation has already been processed with the same official Grizzly status,
    // return SUCCESS immediately without repeating financial transactions or counters.
    if (activation.official_grizzly_status === grizzlyStatus) {
      db.prepare(`
        UPDATE grizzly_activations
        SET callback_count = callback_count + 1, callback_received_at = datetime('now')
        WHERE id = ?
      `).run(activation.id);
      return { status: 'SUCCESS' };
    }

    const phone = activation.phone_number;
    const service = activation.service;
    const requestedSum = activation.requested_sum || 0.0;
    const rewardAmount = callback.reward !== undefined ? Number(callback.reward) : (callback.sum !== undefined ? Number(callback.sum) : requestedSum);

    const tx = db.transaction(() => {
      let internalStatus = 'finished';

      if (grizzlyStatus === GRIZZLY_STATUS.PROHIBITED) {
        // Status 1: Number issuance prohibited
        internalStatus = 'prohibited';

        // Record in prohibited numbers table
        db.prepare(`
          INSERT INTO grizzly_prohibited_numbers (id, phone_number, service, activation_id, reason)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(phone_number, service) DO UPDATE SET
            activation_id = excluded.activation_id,
            reason = excluded.reason,
            prohibited_at = datetime('now')
        `).run(
          crypto.randomUUID(),
          phone,
          service,
          activationId,
          callback.reason || 'Status 1: Number issuance prohibited by GrizzlySMS'
        );

        // Update accounting
        db.prepare(`
          UPDATE grizzly_provider_accounting
          SET settlement_status = 'cancelled', notes = ?, updated_at = datetime('now')
          WHERE activation_id = ?
        `).run('Prohibited by provider (Status 1)', activationId);

      } else if (grizzlyStatus === GRIZZLY_STATUS.SOLD) {
        // Status 3: Successfully sold
        internalStatus = 'finished';

        // Record reward once
        db.prepare(`
          UPDATE grizzly_provider_accounting
          SET reward_amount = ?, settlement_status = 'confirmed',
              notes = ?, updated_at = datetime('now')
          WHERE activation_id = ?
        `).run(rewardAmount, 'Successfully sold (Status 3)', activationId);

        // Inventory total allocations already incremented on GET_NUMBER; return to available if reusable
        if (activation.inventory_id) {
          db.prepare(`
            UPDATE grizzly_inventory
            SET status = 'available', updated_at = datetime('now')
            WHERE id = ?
          `).run(activation.inventory_id);
        }

      } else if (grizzlyStatus === GRIZZLY_STATUS.CANCELLED) {
        // Status 4: Activation cancelled
        internalStatus = 'cancelled';

        // Increment cancellation counter atomically for (phone_number, service)
        db.prepare(`
          INSERT INTO grizzly_number_service_cancellations (
            id, phone_number, service, cancellation_count, is_permanently_excluded, last_cancelled_at, last_reason
          ) VALUES (?, ?, ?, 1, 0, datetime('now'), ?)
          ON CONFLICT(phone_number, service) DO UPDATE SET
            cancellation_count = cancellation_count + 1,
            is_permanently_excluded = CASE WHEN cancellation_count + 1 >= 5 THEN 1 ELSE 0 END,
            last_cancelled_at = datetime('now'),
            last_reason = excluded.last_reason,
            updated_at = datetime('now')
        `).run(
          crypto.randomUUID(),
          phone,
          service,
          callback.reason || 'Status 4: Activation cancelled'
        );

        // Update accounting
        db.prepare(`
          UPDATE grizzly_provider_accounting
          SET settlement_status = 'cancelled', notes = ?, updated_at = datetime('now')
          WHERE activation_id = ?
        `).run(callback.reason || 'Cancelled by provider (Status 4)', activationId);

        // If reusable and not permanently excluded for this service, return inventory to available
        if (activation.inventory_id) {
          db.prepare(`
            UPDATE grizzly_inventory
            SET status = 'available', updated_at = datetime('now')
            WHERE id = ?
          `).run(activation.inventory_id);
        }

      } else if (grizzlyStatus === GRIZZLY_STATUS.RETURNED) {
        // Status 5: Activation returned
        internalStatus = 'returned';

        // Record customer refund in provider accounting
        db.prepare(`
          UPDATE grizzly_provider_accounting
          SET settlement_status = 'refunded', notes = ?, updated_at = datetime('now')
          WHERE activation_id = ?
        `).run(callback.reason || 'Activation returned (Status 5 refund)', activationId);

        // Quarantine the number for the affected service
        db.prepare(`
          INSERT INTO grizzly_number_quarantine (
            id, phone_number, service, activation_id, reason, status, quarantined_at
          ) VALUES (?, ?, ?, ?, ?, 'quarantined', datetime('now'))
          ON CONFLICT(phone_number, service) DO UPDATE SET
            activation_id = excluded.activation_id,
            reason = excluded.reason,
            status = 'quarantined',
            quarantined_at = datetime('now')
        `).run(
          crypto.randomUUID(),
          phone,
          service,
          activationId,
          callback.reason || 'Status 5: Activation returned - potentially previously registered'
        );

        // Mark inventory in cooldown/maintenance
        if (activation.inventory_id) {
          db.prepare(`
            UPDATE grizzly_inventory
            SET status = 'cooldown', updated_at = datetime('now')
            WHERE id = ?
          `).run(activation.inventory_id);
        }
      }

      // Update activation record with official Grizzly status
      db.prepare(`
        UPDATE grizzly_activations
        SET status = ?,
            official_grizzly_status = ?,
            completed_at = datetime('now'),
            callback_received_at = datetime('now'),
            callback_count = callback_count + 1,
            cancellation_reason = ?
        WHERE id = ?
      `).run(
        internalStatus,
        grizzlyStatus,
        callback.reason || null,
        activation.id
      );

      // Release hardware module slot if occupied
      if (activation.hardware_module_id) {
        GrizzlyHardwareCapacityService.releaseModule(activation.hardware_module_id);
      }

      // Invalidate GET_SERVICES cache
      GrizzlyPartnerProtocolService.invalidateCache();
    });

    tx();

    console.log(`[Grizzly FINISH_ACTIVATION] Processed activation #${activationId} with official status ${grizzlyStatus}. Hardware slot released.`);
    return { status: 'SUCCESS' };
  }
}

export const grizzlyFinishActivationAdapter = new GrizzlyFinishActivationAdapter();
