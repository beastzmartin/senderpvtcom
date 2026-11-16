import crypto from 'crypto';
import { initCrmDatabase, getCrmDb } from '../src/crm/db/index.js';
import { getDatabase } from '../src/db/database.js';
import { CrmWebhookService } from '../src/crm/services/CrmWebhookService.js';
import { CrmCloudApiAdapter } from '../src/crm/services/CrmCloudApiAdapter.js';
import { CrmOpenApiService } from '../src/crm/services/CrmOpenApiService.js';
import { crmIdempotencyMiddleware } from '../src/crm/middleware/crmIdempotencyMiddleware.js';

async function runPhase8Tests() {
  console.log('🌐 [CRM V2] Starting Phase 8 External API V2 & Integrations Verification Suite...\n');

  // 1. Initialize Storage
  const db = await initCrmDatabase();
  console.log('✅ CRM Database Initialized successfully.');

  const localDb = getDatabase();
  const testUserStmt = localDb.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
  const testUserId = testUserStmt ? testUserStmt.id : 'user_api_test_' + Date.now();
  if (!testUserStmt) {
    localDb.prepare(`INSERT INTO users (id, username, password, role, is_active, created_at) VALUES (?, ?, 'pwd', 'admin', 1, datetime('now'))`).run(testUserId, 'api_tester');
  }

  const ws = await db.createWorkspace(testUserId, 'API & Integrations Workspace ' + Date.now());
  console.log(`✅ Test Workspace Created: ${ws.name} (${ws.id})`);

  // 2. Test Idempotency Middleware
  console.log('\n--- Test 1: IETF Idempotency-Key Middleware ---');
  const idempotencyKey = 'idemp_key_' + Date.now();
  let executionCount = 0;

  // Mock Express Request & Response for First Call
  const fakeReq1: any = {
    method: 'POST',
    baseUrl: '/api/crm',
    path: '/contacts',
    header: (h: string) => (h.toLowerCase() === 'idempotency-key' ? idempotencyKey : null),
    user: { id: testUserId }
  };
  const headers1: Record<string, string> = {};
  const fakeRes1: any = {
    statusCode: 200,
    setHeader: (k: string, v: string) => { headers1[k] = v; },
    status: function(s: number) { this.statusCode = s; return this; },
    json: function(b: any) { this.body = b; return this; }
  };

  crmIdempotencyMiddleware(fakeReq1, fakeRes1, () => {
    executionCount++;
    fakeRes1.status(201).json({ success: true, contactId: 'contact_xyz_1' });
  });

  console.log(`First Request Executed: status=${fakeRes1.statusCode}, X-Cache-Lookup=${headers1['X-Cache-Lookup']}, executionCount=${executionCount}`);
  if (headers1['X-Cache-Lookup'] !== 'MISS' || executionCount !== 1) {
    throw new Error('First idempotency call should be MISS with 1 execution');
  }

  // Second Duplicate Call with Same Idempotency-Key
  const fakeReq2: any = { ...fakeReq1 };
  const headers2: Record<string, string> = {};
  const fakeRes2: any = {
    statusCode: 200,
    setHeader: (k: string, v: string) => { headers2[k] = v; },
    status: function(s: number) { this.statusCode = s; return this; },
    json: function(b: any) { this.body = b; return this; }
  };

  crmIdempotencyMiddleware(fakeReq2, fakeRes2, () => {
    executionCount++;
  });

  console.log(`Second Duplicate Request: status=${fakeRes2.statusCode}, X-Cache-Lookup=${headers2['X-Cache-Lookup']}, executionCount=${executionCount}`);
  if (headers2['X-Cache-Lookup'] !== 'HIT' || executionCount !== 1 || fakeRes2.body?.contactId !== 'contact_xyz_1') {
    throw new Error('Second idempotency call should be HIT and return cached body without executing handler');
  }

  // 3. Test Webhooks V2: HMAC-SHA256 & Diagnostics
  console.log('\n--- Test 2: Webhooks V2 HMAC-SHA256 & Tester Diagnostics ---');
  const webhook = await db.createWebhook(ws.id, {
    name: 'Zapier Production Sink',
    url: 'https://httpbin.org/post',
    events: ['contact.created', 'contact.updated']
  });
  console.log(`Registered Webhook: ${webhook.name} (${webhook.id}) -> ${webhook.url}`);

  const webhookService = CrmWebhookService.getInstance();
  const testDiagnostics = await webhookService.testWebhook(ws.id, webhook.id);
  console.log('Webhook Tester Diagnostics:', {
    success: testDiagnostics.success,
    statusCode: testDiagnostics.statusCode,
    durationMs: testDiagnostics.durationMs,
    signatureLength: testDiagnostics.signature.length
  });

  if (!testDiagnostics.signature || testDiagnostics.signature.length !== 64) {
    throw new Error('Expected 64-character HMAC-SHA256 signature in hex');
  }

  // 4. Test WhatsApp Cloud API Adapter Inbound & Status Callback
  console.log('\n--- Test 3: WhatsApp Cloud API Adapter (Meta Graph API) ---');
  const uid = Date.now().toString().slice(-4);
  const cloudContact = await db.createContact(ws.id, {
    first_name: 'Rohit',
    last_name: 'Verma',
    phone: `+91987000${uid}`,
    email: `rohit.${uid}@corp.in`
  });

  const cloudAdapter = CrmCloudApiAdapter.getInstance();

  // Simulate Meta Graph API Inbound Webhook Payload
  const rawMetaWebhook = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba_123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550234567', phone_number_id: '10987654321' },
              contacts: [{ profile: { name: 'Rohit Verma' }, wa_id: `91987000${uid}` }],
              messages: [
                {
                  from: `91987000${uid}`,
                  id: 'wamid.HBgLMzkxOTg3MDAw' + uid,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: 'Hello! I need pricing for enterprise WhatsApp plans.' },
                  type: 'text'
                }
              ],
              statuses: [
                {
                  id: 'wamid.HBgLMzkxOTg3MDAw_prev',
                  status: 'delivered',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: `91987000${uid}`
                }
              ]
            },
            field: 'messages'
          }
        ]
      }
    ]
  };

  const processedMeta = await cloudAdapter.handleWebhookPayload(ws.id, rawMetaWebhook);
  console.log('Processed Meta Webhook Payload:', processedMeta);
  if (processedMeta.processedMessages !== 1 || processedMeta.processedStatuses !== 1) {
    throw new Error('Meta Cloud API webhook processing failed');
  }

  // Verify that an activity was recorded for the inbound message
  const activities = await db.listActivities(ws.id, cloudContact.id, 5);
  const inboundAct = activities.find((a) => a.title.includes('Cloud API'));
  console.log('✅ Inbound Activity logged on contact:', inboundAct?.title, inboundAct?.details);
  if (!inboundAct) {
    throw new Error('Failed to find recorded inbound WhatsApp Cloud API activity');
  }

  // 5. Test OpenAPI 3.1 Spec Generation
  console.log('\n--- Test 4: OpenAPI 3.1.0 Specification ---');
  const openApi = CrmOpenApiService.getInstance();
  const spec = openApi.getOpenApiSpec();
  console.log(`OpenAPI Version: ${spec.openapi}, Title: ${spec.info.title}`);
  console.log('Paths count:', Object.keys(spec.paths).length);

  if (spec.openapi !== '3.1.0' || !spec.paths['/contacts']) {
    throw new Error('OpenAPI 3.1 specification generation invalid');
  }

  console.log('\n🎉 ALL PHASE 8 EXTERNAL API V2 & INTEGRATION TESTS PASSED WITH 0 ERRORS!\n');
}

runPhase8Tests().catch((err) => {
  console.error('❌ Phase 8 Test Suite Failed:', err);
  process.exit(1);
});
