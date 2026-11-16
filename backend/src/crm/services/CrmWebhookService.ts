import crypto from 'crypto';
import { getCrmDb } from '../db/index.js';

export class CrmWebhookService {
  private static instance: CrmWebhookService | null = null;

  public static getInstance(): CrmWebhookService {
    if (!CrmWebhookService.instance) {
      CrmWebhookService.instance = new CrmWebhookService();
    }
    return CrmWebhookService.instance;
  }

  /**
   * Dispatch an event to all active webhooks subscribed to that event type
   */
  public async dispatchEvent(
    workspaceId: string,
    eventType: 'contact.created' | 'contact.updated' | 'contact.deleted' | 'import.completed' | 'extraction.completed',
    payload: Record<string, any>
  ): Promise<void> {
    const db = getCrmDb();
    const webhooks = await db.listWebhooks(workspaceId);
    const activeSubscribers = webhooks.filter((w) => w.is_active && w.events.includes(eventType));

    for (const hook of activeSubscribers) {
      // Fire async with retries
      this.deliverWithRetry(hook.id, workspaceId, hook.url, hook.secret, eventType, payload).catch((err) => {
        console.warn(`[CrmWebhookService] Delivery error to ${hook.url}:`, err);
      });
    }
  }

  private async deliverWithRetry(
    webhookId: string,
    workspaceId: string,
    url: string,
    secret: string,
    eventType: string,
    payload: Record<string, any>,
    maxRetries: number = 3
  ): Promise<void> {
    const db = getCrmDb();
    const bodyStr = JSON.stringify({
      id: crypto.randomUUID(),
      event: eventType,
      timestamp: new Date().toISOString(),
      workspace_id: workspaceId,
      data: payload
    });

    // HMAC SHA-256 signature
    const signature = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CRM-Signature': signature,
            'X-CRM-Event': eventType,
            'User-Agent': 'CRM-Webhook-Dispatcher/1.0'
          },
          body: bodyStr,
          signal: AbortSignal.timeout(10000)
        });

        const duration = Date.now() - startTime;
        const resText = await response.text().catch(() => '');
        const success = response.ok;

        await db.logWebhookDelivery({
          workspace_id: workspaceId,
          webhook_id: webhookId,
          event_type: eventType,
          payload,
          status_code: response.status,
          response_body: resText.slice(0, 1000),
          duration_ms: duration,
          attempt,
          success
        });

        if (success) {
          return;
        }
      } catch (err: any) {
        const duration = Date.now() - startTime;
        await db.logWebhookDelivery({
          workspace_id: workspaceId,
          webhook_id: webhookId,
          event_type: eventType,
          payload,
          status_code: 0,
          response_body: err.message,
          duration_ms: duration,
          attempt,
          success: false
        });
      }

      // Backoff before retry (1s, 2s)
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }
}

