import { getDatabase } from '../../../db/database.js';
import { GrizzlyHardwareModule } from './types.js';

export class GrizzlyHardwareCapacityService {
  /**
   * Retrieves summary of hardware capacity and active SIM modules
   */
  public static getCapacitySummary() {
    const db = getDatabase();

    const modules = db.prepare(`
      SELECT
        COUNT(*) as totalModules,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeModules,
        SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupiedModules,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedModules,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenanceModules
      FROM grizzly_hardware_modules
    `).get() as any;

    const inventory = db.prepare(`
      SELECT
        COUNT(*) as totalNumbers,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as availableNumbers,
        SUM(CASE WHEN status = 'allocated' THEN 1 ELSE 0 END) as allocatedNumbers
      FROM grizzly_inventory
    `).get() as any;

    const activations = db.prepare(`
      SELECT
        COUNT(*) as totalActivations,
        SUM(CASE WHEN status = 'allocated' OR status = 'active' THEN 1 ELSE 0 END) as liveActiveActivations,
        SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as successfulActivations
      FROM grizzly_activations
    `).get() as any;

    return {
      modules: {
        total: modules?.totalModules || 0,
        active: modules?.activeModules || 0,
        occupied: modules?.occupiedModules || 0,
        failed: modules?.failedModules || 0,
        maintenance: modules?.maintenanceModules || 0
      },
      inventory: {
        total: inventory?.totalNumbers || 0,
        available: inventory?.availableNumbers || 0,
        allocated: inventory?.allocatedNumbers || 0
      },
      activations: {
        total: activations?.totalActivations || 0,
        live: activations?.liveActiveActivations || 0,
        successful: activations?.successfulActivations || 0
      }
    };
  }

  /**
   * Returns list of all hardware modules with current status
   */
  public static listModules(): GrizzlyHardwareModule[] {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM grizzly_hardware_modules ORDER BY slot_number ASC
    `).all() as any[];

    return rows.map((r) => {
      let services: string[] = [];
      try {
        services = JSON.parse(r.supported_services || '[]');
      } catch {
        services = [];
      }

      return {
        id: r.id,
        slotNumber: r.slot_number,
        name: r.name,
        simIccid: r.sim_iccid,
        phoneNumber: r.phone_number,
        countryId: r.country_id,
        operator: r.operator,
        supportedServices: services,
        status: r.status,
        maxConcurrentChannels: r.max_concurrent_channels,
        activeActivationId: r.active_activation_id
      };
    });
  }

  /**
   * Release hardware module slot back to 'active' status
   */
  public static releaseModule(moduleId: string): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE grizzly_hardware_modules
      SET status = 'active', active_activation_id = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(moduleId);
  }

  /**
   * Mark hardware module as occupied by activation ID
   */
  public static occupyModule(moduleId: string, activationId: string): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE grizzly_hardware_modules
      SET status = 'occupied', active_activation_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(activationId, moduleId);
  }
}

