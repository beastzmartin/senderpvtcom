import { getDatabase } from '../../../db/database.js';
import { GrizzlyCustomerPricingService } from './GrizzlyCustomerPricingService.js';
import { GrizzlyCustomerReconciliationService } from './GrizzlyCustomerReconciliationService.js';
import { GrizzlyCustomerConfigService } from './GrizzlyCustomerConfigService.js';
import { GrizzlyCatalogSyncService } from './GrizzlyCatalogSyncService.js';

export class GrizzlyCustomerSchedulerService {
  private static workerInterval: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Start background scheduler for automatic price sync and active activations reconciliation
   */
  public static startWorker(intervalMs = 60000): void {
    if (this.workerInterval) return;

    console.log('[Grizzly Customer Scheduler] Starting background sync & reconciliation runner...');
    this.workerInterval = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[Grizzly Customer Scheduler] Error in background tick:', err.message);
      });
    }, intervalMs);

    // Initial check after 5 seconds
    setTimeout(() => {
      this.tick().catch(() => {});
    }, 5000);
  }

  public static stopWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
      console.log('[Grizzly Customer Scheduler] Background worker stopped.');
    }
  }

  /**
   * Periodic check for scheduled jobs
   */
  public static async tick(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const config = GrizzlyCustomerConfigService.getConfig(false);
      if (!config.is_enabled || !config.api_key) {
        return;
      }

      const now = Date.now();

      // 1. Auto Price Sync Check
      if (config.auto_price_sync) {
        const intervalMins = config.price_sync_interval_minutes || 60;
        const lastSync = config.last_price_sync_at ? new Date(config.last_price_sync_at).getTime() : 0;
        const elapsedMins = (now - lastSync) / (60 * 1000);

        if (elapsedMins >= intervalMins) {
          console.log(`[Grizzly Customer Scheduler] Triggering automatic price sync (${intervalMins}m interval elapsed)...`);
          await GrizzlyCustomerPricingService.syncPrices({
            endpoint: (config.pricing_endpoint as any) || 'getPricesV3'
          });
        }
      }

      // 2. Auto Reconciliation Check
      if (config.auto_reconciliation) {
        const reconIntervalMins = config.reconciliation_interval_minutes || 30;
        const lastRecon = config.last_reconciliation_at ? new Date(config.last_reconciliation_at).getTime() : 0;
        const elapsedMins = (now - lastRecon) / (60 * 1000);

        if (elapsedMins >= reconIntervalMins) {
          console.log(`[Grizzly Customer Scheduler] Triggering automatic reconciliation (${reconIntervalMins}m interval elapsed)...`);
          await GrizzlyCustomerReconciliationService.runReconciliation();
        }
      }

      // 3. Auto Services Catalogue Sync Check
      if (config.auto_services_sync !== 0) {
        const servicesIntervalHours = config.services_sync_interval_hours || 24;
        const db = getDatabase();
        const servicesJob = db.prepare("SELECT last_successful_at FROM grizzly_sync_jobs WHERE job_type = 'services'").get() as any;
        const lastServicesSync = servicesJob?.last_successful_at ? new Date(servicesJob.last_successful_at).getTime() : 0;
        const elapsedHours = (now - lastServicesSync) / (60 * 60 * 1000);

        if (elapsedHours >= servicesIntervalHours) {
          console.log(`[Grizzly Customer Scheduler] Triggering automatic services catalogue sync (${servicesIntervalHours}h interval elapsed)...`);
          await GrizzlyCatalogSyncService.syncServicesCatalogue();
        }
      }

      // 4. Auto Multilingual Countries Sync Check
      if (config.auto_countries_sync !== 0) {
        const countriesIntervalHours = config.countries_sync_interval_hours || 24;
        const db = getDatabase();
        const countriesJob = db.prepare("SELECT last_successful_at FROM grizzly_sync_jobs WHERE job_type = 'countries'").get() as any;
        const lastCountriesSync = countriesJob?.last_successful_at ? new Date(countriesJob.last_successful_at).getTime() : 0;
        const elapsedHours = (now - lastCountriesSync) / (60 * 60 * 1000);

        if (elapsedHours >= countriesIntervalHours) {
          console.log(`[Grizzly Customer Scheduler] Triggering automatic countries catalogue sync (${countriesIntervalHours}h interval elapsed)...`);
          await GrizzlyCatalogSyncService.syncCountriesCatalogue();
        }
      }
    } catch (err: any) {
      console.warn('[Grizzly Customer Scheduler] Worker tick error:', err.message);
    } finally {
      this.isRunning = false;
    }
  }
}

