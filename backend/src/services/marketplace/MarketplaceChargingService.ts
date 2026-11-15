import { getDatabase } from '../../db/database.js';
import { WalletService } from '../walletService.js';
import { MarketplacePricingService } from './MarketplacePricingService.js';
import { ProductDefinition, MarketplaceJobRecord } from '../../types/marketplace.js';

export class MarketplaceChargingService {
  private static instance: MarketplaceChargingService | null = null;
  private walletService: WalletService;
  private pricingService: MarketplacePricingService;

  private constructor() {
    this.walletService = WalletService.getInstance();
    this.pricingService = MarketplacePricingService.getInstance();
  }

  public static getInstance(): MarketplaceChargingService {
    if (!MarketplaceChargingService.instance) {
      MarketplaceChargingService.instance = new MarketplaceChargingService();
    }
    return MarketplaceChargingService.instance;
  }

  /**
   * Step 4 & 5: Reserve funds from user wallet before starting provider extraction
   */
  public reserveForJob(
    userId: string,
    product: ProductDefinition,
    requestedItems: number,
    jobId: string
  ): {
    reservationId: string;
    reservedAmount: number;
    providerCostUsd: number;
    providerCostConverted: number;
    currency: string;
  } {
    const estimate = this.pricingService.calculateEstimatedPrice(product, requestedItems);
    const description = `Data Extraction Reserve: ${product.display_name} (${requestedItems} items)`;

    // Atomic hold via existing WalletService
    const reserveRes = this.walletService.reserveFunds(
      userId,
      estimate.sellPrice,
      description,
      jobId,
      {
        jobId,
        productSlug: product.slug,
        requestedItems
      }
    );

    return {
      reservationId: reserveRes.reservationId,
      reservedAmount: estimate.sellPrice,
      providerCostUsd: estimate.providerCostUsd,
      providerCostConverted: estimate.providerCostConverted,
      currency: estimate.currency
    };
  }

  /**
   * Step 8: Settle actual charges upon job completion and release excess reservation
   */
  public settleJob(
    jobId: string,
    itemsDelivered: number,
    actualProviderCostUsd: number
  ): {
    finalCharge: number;
    refundDue: number;
    netProfit: number;
  } {
    const db = getDatabase();
    const job = db.prepare('SELECT * FROM marketplace_jobs WHERE id = ?').get(jobId) as any;
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Already settled check for idempotency
    if (job.status === 'COMPLETED' || job.status === 'PARTIAL' || job.settle_tx_id) {
      return {
        finalCharge: job.charged_amount,
        refundDue: 0,
        netProfit: Number((job.charged_amount - job.provider_cost_converted).toFixed(2))
      };
    }

    const prodRow = db.prepare('SELECT definition_json FROM extraction_marketplace_products WHERE id = ?').get(job.product_id) as any;
    if (!prodRow) {
      throw new Error(`Product not found for job: ${jobId}`);
    }
    const product: ProductDefinition = JSON.parse(prodRow.definition_json);

    const settlement = this.pricingService.calculateSettlementPrice(
      product,
      itemsDelivered,
      Number(job.reserved_amount),
      actualProviderCostUsd,
      job.currency
    );

    const settleTx = db.transaction(() => {
      let settleTxId = job.reservation_tx_id;

      if (settlement.finalCharge > 0) {
        // Commit the actual charge from reservation
        const commitRes = this.walletService.commitReservation(
          job.user_id,
          settlement.finalCharge,
          job.reservation_tx_id,
          `Data Extraction Settled: ${job.product_name} (${itemsDelivered} items delivered)`,
          {
            jobId,
            itemsDelivered,
            finalCharge: settlement.finalCharge,
            providerCostUsd: settlement.providerCostUsd,
            netProfit: settlement.netProfit
          }
        );
        settleTxId = commitRes.transactionId;
      }

      // If there was excess reserved amount, release it back to available balance
      if (settlement.refundDue > 0) {
        this.walletService.releaseReservation(
          job.user_id,
          settlement.refundDue,
          job.reservation_tx_id,
          `Unused reserve released (${itemsDelivered}/${job.requested_items} items collected)`
        );
      }

      const newStatus = itemsDelivered >= job.requested_items
        ? 'COMPLETED'
        : itemsDelivered > 0
          ? 'PARTIAL'
          : 'COMPLETED';

      db.prepare(`
        UPDATE marketplace_jobs
        SET items_delivered = ?,
            charged_amount = ?,
            provider_cost_usd = ?,
            provider_cost_converted = ?,
            settle_tx_id = ?,
            status = ?,
            finished_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        itemsDelivered,
        settlement.finalCharge,
        settlement.providerCostUsd,
        settlement.providerCostConverted,
        settleTxId,
        newStatus,
        jobId
      );
    });

    settleTx();

    return {
      finalCharge: settlement.finalCharge,
      refundDue: settlement.refundDue,
      netProfit: settlement.netProfit
    };
  }

  /**
   * Step 9: Refund entire reservation when a job fails or is aborted with 0 results
   */
  public refundFailedJob(jobId: string, reason: string): void {
    const db = getDatabase();
    const job = db.prepare('SELECT * FROM marketplace_jobs WHERE id = ?').get(jobId) as any;
    if (!job) return;

    if (job.status === 'FAILED' || job.status === 'ABORTED') {
      return; // Already processed
    }

    const refundTx = db.transaction(() => {
      if (job.reserved_amount > 0 && job.reservation_tx_id) {
        this.walletService.releaseReservation(
          job.user_id,
          job.reserved_amount,
          job.reservation_tx_id,
          `Extraction failed/aborted: ${reason}`
        );
      }

      db.prepare(`
        UPDATE marketplace_jobs
        SET charged_amount = 0.0,
            status = 'FAILED',
            error_message = ?,
            finished_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(reason, jobId);
    });

    refundTx();
  }
}
