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

  /**
   * Self-serve webhook tester: sends an instant test ping to endpoint and returns diagnostics
   */
  public async testWebhook(
    workspaceId: string,
    webhookId: string
  ): Promise<{ success: boolean; statusCode: number; durationMs: number; signature: string; responseBody: string }> {
    const db = getCrmDb();
    const webhook = await db.getWebhook(workspaceId, webhookId);
    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found`);
    }

    const testPayload = {
      ping_id: crypto.randomUUID(),
      message: 'Self-serve webhook connectivity test ping from CRM V2',
      sent_at: new Date().toISOString()
    };

    const bodyStr = JSON.stringify({
      id: crypto.randomUUID(),
      event: 'webhook.test_ping',
      timestamp: new Date().toISOString(),
      workspace_id: workspaceId,
      data: testPayload
    });

    const signature = crypto.createHmac('sha256', webhook.secret).update(bodyStr).digest('hex');
    const startTime = Date.now();

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CRM-Signature': signature,
          'X-CRM-Event': 'webhook.test_ping',
          'User-Agent': 'CRM-Webhook-Tester/2.0'
        },
        body: bodyStr,
        signal: AbortSignal.timeout(8000)
      });

      const durationMs = Date.now() - startTime;
      const responseBody = await response.text().catch(() => '');

      return {
        success: response.ok,
        statusCode: response.status,
        durationMs,
        signature,
        responseBody: responseBody.slice(0, 1000)
      };
    } catch (err: any) {
      return {
        success: false,
        statusCode: 0,
        durationMs: Date.now() - startTime,
        signature,
        responseBody: err.message
      };
    }
  }
}

