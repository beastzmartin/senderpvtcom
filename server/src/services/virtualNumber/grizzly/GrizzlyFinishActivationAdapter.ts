import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import { GrizzlyHardwareCapacityService } from './GrizzlyHardwareCapacityService.js';
import { GrizzlyPartnerProtocolService } from './GrizzlyPartnerProtocolService.js';
import { GrizzlyFinishActivationPayload, GrizzlyFinishActivationResult } from './types.js';

export interface IGrizzlyFinishActivationAdapter {
  finishActivation(payload: GrizzlyFinishActivationPayload): Promise<GrizzlyFinishActivationResult>;
}

export class GrizzlyFinishActivationAdapter implements IGrizzlyFinishActivationAdapter {
  /**
   * Processes activation completion
   * Status 3 in GrizzlySMS represents successful registration and partner reward.
   */
  public async finishActivation(payload: GrizzlyFinishActivationPayload): Promise<GrizzlyFinishActivationResult> {
    const db = getDatabase();

    const activation = db.prepare(`
      SELECT * FROM grizzly_activations WHERE activation_id = ?
    `).get(payload.activationId) as any;

    if (!activation) {
      throw new Error(`Activation #${payload.activationId} not found.`);
    }

    const isSuccess = payload.statusCode === 3 || payload.statusCode === undefined;
    const newStatus = isSuccess ? 'finished' : (payload.statusCode === 8 ? 'cancelled' : 'expired');
    const rewardAmount = payload.rewardAmount || activation.requested_sum || 0.0;

    const finishTx = db.transaction(() => {
      // 1. Update activation record
      db.prepare(`
        UPDATE grizzly_activations
        SET status = ?, completed_at = datetime('now')
        WHERE id = ?
      `).run(newStatus, activation.id);

      // 2. Update accounting record
      db.prepare(`
        UPDATE grizzly_provider_accounting
        SET reward_amount = ?, settlement_status = ?, provider_ref = ?,
            notes = ?, updated_at = datetime('now')
        WHERE activation_id = ?
      `).run(
        rewardAmount,
        isSuccess ? 'confirmed' : 'cancelled',
        payload.providerRef || null,
        payload.notes || (isSuccess ? 'Activation completed (Status 3)' : `Status code ${payload.statusCode}`),
        payload.activationId
      );

      // 3. Release hardware module slot if occupied
      if (activation.hardware_module_id) {
        GrizzlyHardwareCapacityService.releaseModule(activation.hardware_module_id);
      }

      // 4. Return number to available inventory if reusable
      if (activation.inventory_id) {
        db.prepare(`
          UPDATE grizzly_inventory
          SET status = 'available', updated_at = datetime('now')
          WHERE id = ?
        `).run(activation.inventory_id);
      }

      // 5. Invalidate GET_SERVICES cache
      GrizzlyPartnerProtocolService.invalidateCache();
    });

    finishTx();

    console.log(`[Grizzly FINISH_ACTIVATION] Activation #${payload.activationId} finished with status "${newStatus}". Hardware module released. Reward recorded: $${rewardAmount}.`);

    return {
      success: true,
      activationId: payload.activationId,
      newStatus,
      rewardRecorded: isSuccess,
      hardwareSlotReleased: Boolean(activation.hardware_module_id),
      notes: payload.notes
    };
  }
}

export const grizzlyFinishActivationAdapter = new GrizzlyFinishActivationAdapter();
