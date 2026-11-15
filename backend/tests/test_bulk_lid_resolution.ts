import assert from 'assert';
import http from 'http';
import { ContactService } from '../src/services/contactService.js';
import { getDatabase } from '../src/db/database.js';

function postJson(path: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Failed to parse JSON response: ${body}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http
      .get(
        {
          hostname: 'localhost',
          port: 3000,
          path
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(new Error(`Failed to parse JSON response: ${body}`));
            }
          });
        }
      )
      .on('error', reject);
  });
}

async function runTests() {
  console.log('=== RUNNING BULK LID TO REAL PHONE RESOLUTION TESTS ===');
  const contactService = ContactService.getInstance();
  const db = getDatabase();

  // Test 1: LID normalization
  console.log('\n[Test 1] LID Normalization');
  assert.strictEqual(contactService.normalizeLid(' 216256653340861@lid '), '216256653340861@lid');
  assert.strictEqual(contactService.normalizeLid('216256653340861:13@lid'), '216256653340861@lid');
  assert.strictEqual(contactService.normalizeLid('216256653340861'), '216256653340861@lid');
  console.log('✓ LID normalization handles clean, device-suffix, and numeric formats.');

  // Test 2: Phone normalization
  console.log('\n[Test 2] Phone Normalization');
  assert.strictEqual(contactService.normalizePhone('+91 98765 43210'), '+919876543210');
  assert.strictEqual(contactService.normalizePhone('918822593323:13@s.whatsapp.net'), '+918822593323');
  assert.strictEqual(contactService.normalizePhone('14155552671'), '+14155552671');
  console.log('✓ Phone normalization cleans digits, handles international prefix and device specs.');

  // Test 3: Bi-directional DB Upsert and Fetch
  console.log('\n[Test 3] Bi-directional Upsert and Lookup');
  const testLid = '99988877766655@lid';
  const testPhone = '+919999888877';
  contactService.upsertLidMapping(testLid, testPhone, null, 'Test Dual Contact');

  const resolvedPhone = contactService.getPhoneForLid(testLid);
  assert.strictEqual(resolvedPhone, testPhone);

  const resolvedLid = contactService.getLidForPhone(testPhone);
  assert.strictEqual(resolvedLid, testLid);
  console.log('✓ Upsert and bidirectional retrieval match accurately.');

  // Test 4: Local Bulk Resolution
  console.log('\n[Test 4] Local Bulk Resolution');
  const localBatch = [testLid, '100008565186575@lid', 'nonexistent_test_lid_9999@lid'];
  const localResults = contactService.bulkResolveLidsLocally(localBatch);
  assert.strictEqual(localResults.length, 3);
  assert.strictEqual(localResults[0].status, 'resolved');
  assert.strictEqual(localResults[0].phone, testPhone);
  assert.strictEqual(localResults[2].status, 'unresolved');
  console.log('✓ Local bulk resolution resolves known LIDs and flags unknown ones.');

  // Test 5: HTTP Endpoint POST /api/contacts/resolve-lids
  console.log('\n[Test 5] HTTP API: POST /api/contacts/resolve-lids');
  const apiRes = await postJson('/api/contacts/resolve-lids', {
    lids: [testLid, '100008565186575@lid', '100094229651661@lid']
  });
  assert.strictEqual(apiRes.success, true);
  assert.strictEqual(apiRes.total, 3);
  assert.strictEqual(apiRes.resolved, 3);
  assert.strictEqual(apiRes.unresolved, 0);
  assert.strictEqual(apiRes.results[0].phone, testPhone);
  console.log(`✓ API successfully resolved all 3 LIDs. Status: ${JSON.stringify(apiRes.results.map((r: any) => ({ lid: r.lid, phone: r.phone })))}`);

  // Test 6: HTTP Endpoint GET /api/contacts/lid-mappings
  console.log('\n[Test 6] HTTP API: GET /api/contacts/lid-mappings');
  const mappingsRes = await getJson('/api/contacts/lid-mappings?limit=5');
  assert.strictEqual(Array.isArray(mappingsRes.data), true);
  assert(mappingsRes.total > 1000);
  assert.strictEqual(mappingsRes.data.length, 5);
  console.log(`✓ lid-mappings endpoint returned ${mappingsRes.data.length} rows out of ${mappingsRes.total} total.`);

  // Test 7: HTTP Endpoint POST /api/groups/:id/resolve-lids
  console.log('\n[Test 7] HTTP API: POST /api/groups/:id/resolve-lids');
  const groupRes = await postJson('/api/groups/120363424061197824@g.us/resolve-lids', {});
  assert.strictEqual(groupRes.success, true);
  assert(groupRes.totalResolved > 200);
  console.log(`✓ Group resolve-lids endpoint verified: ${groupRes.totalResolved} of ${groupRes.total} group members resolved to real phone numbers!`);

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

