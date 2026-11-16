import { getCrmDb } from '../db/index.js';
import { CrmWebhookService } from './CrmWebhookService.js';
import { OpenSearchProvider } from './CrmSearchEngine.js';
import { CrmOutboxEvent } from '../models/types.js';

export class CrmOutboxService {
  private static instance: CrmOutboxService | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private searchProvider: OpenSearchProvider;

  private constructor() {
    this.searchProvider = new OpenSearchProvider();
  }

  public static getInstance(): CrmOutboxService {
    if (!CrmOutboxService.instance) {
      CrmOutboxService.instance = new CrmOutboxService();
    }
    return CrmOutboxService.instance;
  }

  public start(pollIntervalMs: number = 3000): void {
    if (this.intervalTimer) return;
    console.log(`[CrmOutboxService] 🚀 Outbox Event Backbone active (poll interval: ${pollIntervalMs}ms)`);
    this.intervalTimer = setInterval(() => {
      this.processPendingEvents().catch((err) => {
        console.error('[CrmOutboxService] Error in processing cycle:', err);
      });
    }, pollIntervalMs);
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      console.log('[CrmOutboxService] ⏹️ Outbox Event Backbone stopped.');
    }
  }

  public async processPendingEvents(batchSize: number = 50): Promise<{ processed: number; errors: number }> {
    if (this.isProcessing) return { processed: 0, errors: 0 };
    this.isProcessing = true;

    let processed = 0;
    let errors = 0;

    try {
      const db = getCrmDb();
      const events: CrmOutboxEvent[] = await db.fetchPendingOutboxEvents(batchSize);

      for (const event of events) {
        try {
          await this.dispatchSingleEvent(event);
          await db.markOutboxEventPublished(event.id);
          processed++;
        } catch (err: any) {
          console.error(`[CrmOutboxService] Failed to dispatch event ${event.id} (${event.event_type}):`, err);
          await db.markOutboxEventFailed(event.id, err.message || 'Unknown dispatch error');
          errors++;
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed, errors };
  }

  private async dispatchSingleEvent(event: CrmOutboxEvent): Promise<void> {
    const { workspace_id, event_type, aggregate_type, payload } = event;

    // 1. Dispatch Webhooks
    const webhookService = CrmWebhookService.getInstance();
    if (
      event_type === 'contact.created' ||
      event_type === 'contact.updated' ||
      event_type === 'contact.deleted' ||
      event_type === 'import.completed' ||
      event_type === 'extraction.completed'
    ) {
      await webhookService.dispatchEvent(workspace_id, event_type as any, payload);
    }

    // 2. OpenSearch / Analytical Secondary Index Sync
    if (aggregate_type === 'contact') {
      if (event_type === 'contact.created' || event_type === 'contact.updated') {
        const contactData = payload.current || payload;
        if (contactData && contactData.id) {
          await this.searchProvider.indexContact(contactData);
        }
      } else if (event_type === 'contact.deleted') {
        await this.searchProvider.deleteContact(workspace_id, event.aggregate_id);
      }
    }

    // 3. Custom Object Event Handling
    if (aggregate_type === 'custom_object') {
      // Available for custom downstream consumers and workflows
    }
  }
}

