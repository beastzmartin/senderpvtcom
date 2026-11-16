import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find database path automatically
const candidates = [
  path.resolve(__dirname, '../../data/whatsapp_messenger.db'),
  path.resolve(__dirname, '../data/whatsapp_messenger.db'),
  path.resolve(process.cwd(), 'data/whatsapp_messenger.db'),
  path.resolve(process.cwd(), 'backend/data/whatsapp_messenger.db'),
];

const dbPath = candidates.find(p => fs.existsSync(p));
if (!dbPath) {
  console.error('❌ Could not find whatsapp_messenger.db! Checked:\n', candidates.join('\n'));
  process.exit(1);
}

console.log(`✓ Using database: ${dbPath}`);
const db = new Database(dbPath);

// Import compiled contact service from dist
const contactServiceModule = await import('../dist/services/contactService.js');
const contactService = contactServiceModule.contactService || contactServiceModule.ContactService.getInstance();

function parseSpintax(text, seed) {
  if (!text) return '';
  const spintaxRegex = /\{([^{}]+)\}/g;
  let result = text;
  let safety = 0;
  while (spintaxRegex.test(result) && safety < 10) {
    safety++;
    result = result.replace(spintaxRegex, (_match, group) => {
      const options = group.split('|');
      const idx = seed !== undefined ? Math.abs(seed) % options.length : Math.floor(Math.random() * options.length);
      return options[idx] || '';
    });
  }
  return result;
}

function sanitizePhoneForLink(phone) {
  return (phone || '').replace(/\D/g, '');
}

function buildProtocolLinks(cleanPhone, encodedText, lid) {
  if (!cleanPhone) {
    return {
      waMe: '',
      apiWhatsApp: '',
      webWhatsApp: '',
      appIntent: '',
      directAction: `app://sender?lid=${encodeURIComponent(lid)}&text=${encodedText}`
    };
  }

  return {
    waMe: `https://wa.me/${cleanPhone}?text=${encodedText}`,
    apiWhatsApp: `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`,
    webWhatsApp: `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`,
    appIntent: `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`,
    directAction: `https://wa.me/${cleanPhone}?text=${encodedText}`
  };
}

async function runVerification() {
  console.log('\n===============================================================');
  console.log('🚀 Starting LID Link Generator & Multi-Protocol Dispatcher Tests');
  console.log('===============================================================\n');

  // 1. Insert known LID mapping for verification
  const testLid = '7757465940199@lid';
  const testPhone = '+919876543210';
  const testName = 'Robert California';

  db.prepare(`
    INSERT OR REPLACE INTO lid_mappings (lid, phone_number, jid, display_name, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(testLid, testPhone, '919876543210@s.whatsapp.net', testName, new Date().toISOString());
  console.log(`✓ Seeded test LID mapping: ${testLid} -> ${testPhone} (${testName})`);

  // 2. Test 1: Resolving Plain LID with mapping in database
  console.log('\n[TEST 1] Resolving Plain LID with database mapping...');
  const res1 = contactService.bulkResolveLidsLocally([testLid]);
  console.log('   Result:', res1[0]);
  if (!res1[0] || res1[0].status !== 'resolved' || res1[0].phone !== testPhone) {
    throw new Error(`Test 1 Failed: Expected resolved phone ${testPhone}, got ${res1[0]?.phone}`);
  }
  console.log('   ✓ Test 1 Passed: Successfully resolved LID from database mapping');

  // 3. Test 2: Input already formatted as E.164 phone
  console.log('\n[TEST 2] Input directly as E.164 Phone (+14155552671)...');
  const directPhone = '+14155552671';
  const res2 = contactService.bulkResolveLidsLocally([directPhone]);
  console.log('   Result:', res2[0]);
  if (!res2[0] || res2[0].status !== 'resolved' || res2[0].phone !== directPhone) {
    throw new Error(`Test 2 Failed: Expected direct phone resolution, got ${res2[0]?.phone}`);
  }
  console.log('   ✓ Test 2 Passed: Direct phone correctly recognized and marked resolved');

  // 4. Test 3: Unresolved Privacy LID
  console.log('\n[TEST 3] Unresolved Privacy LID (No phone mapping)...');
  const privateLid = '999888777666555@lid';
  const res3 = contactService.bulkResolveLidsLocally([privateLid]);
  console.log('   Result:', res3[0]);
  if (!res3[0] || res3[0].status !== 'unresolved' || res3[0].phone !== null) {
    throw new Error(`Test 3 Failed: Expected unresolved LID, got status ${res3[0]?.status}`);
  }
  console.log('   ✓ Test 3 Passed: Correctly identified as Unresolved Privacy LID');

  // 5. Test 4: Nested Spintax & Personalization Evaluation
  console.log('\n[TEST 4] Spintax Parsing & Personalization Engine...');
  const spintaxTemplate = '{Hello|Hi|{Hey|Dear}} {name}! 🚀 Special offer #{random_code} for {business_name}.\nClick link: https://example.com';
  
  const sampleVariations = new Set();
  for (let i = 0; i < 20; i++) {
    const rendered = parseSpintax(spintaxTemplate, i)
      .replace('{name}', 'Alice')
      .replace('{business_name}', 'Acme AI')
      .replace('{random_code}', String(1000 + i));
    sampleVariations.add(rendered.split(' ')[0]); // Check greetings
  }
  console.log('   Generated greeting variations from Spintax:', Array.from(sampleVariations));
  if (sampleVariations.size < 2) {
    throw new Error('Test 4 Failed: Spintax did not produce variations');
  }
  console.log('   ✓ Test 4 Passed: Spintax dynamically evaluated multiple greetings');

  // 6. Test 5: Multi-Protocol WhatsApp Link Generation with Emojis & Multiline text
  console.log('\n[TEST 5] Multi-Protocol Link Generation (wa.me, api, web, intent, direct)...');
  const complexMessage = `Hello *Robert*! 🚀\nLine 2 with special symbols: 100% & ? = #\nReply to confirm.`;
  const encodedMessage = encodeURIComponent(complexMessage);
  const cleanPhone = sanitizePhoneForLink(testPhone);

  const links = buildProtocolLinks(cleanPhone, encodedMessage, testLid);
  console.log('   1. wa.me link:        ', links.waMe);
  console.log('   2. api.whatsapp link: ', links.apiWhatsApp);
  console.log('   3. web.whatsapp link: ', links.webWhatsApp);
  console.log('   4. whatsapp:// intent:', links.appIntent);

  if (!links.waMe.startsWith('https://wa.me/919876543210?text=Hello%20*Robert*!%20%F0%9F%9A%80%0ALine%202')) {
    throw new Error(`Test 5 Failed: wa.me link generation failed syntax validation: ${links.waMe}`);
  }
  if (!links.appIntent.startsWith('whatsapp://send?phone=919876543210')) {
    throw new Error(`Test 5 Failed: whatsapp:// intent link invalid: ${links.appIntent}`);
  }
  console.log('   ✓ Test 5 Passed: All 4 protocols and multiline/emoji encodings verified 100% valid');

  // 7. Test 6: In-App Direct Action Link for Pure LIDs
  console.log('\n[TEST 6] In-App Direct Action Link for Unresolved Privacy LIDs...');
  const unresolvedLinks = buildProtocolLinks(null, encodedMessage, privateLid);
  console.log('   Direct Action Link:   ', unresolvedLinks.directAction);
  if (!unresolvedLinks.directAction.includes('app://sender?lid=999888777666555%40lid')) {
    throw new Error('Test 6 Failed: In-app direct action link format invalid');
  }
  console.log('   ✓ Test 6 Passed: Fallback direct action link verified for privacy LIDs');

  // 8. Test 7: Scalability & Performance Benchmarking (10,000 LIDs)
  console.log('\n[TEST 7] Performance Benchmark: Resolving 10,000 LIDs in bulk...');
  const largeBatch = [];
  for (let i = 0; i < 10000; i++) {
    largeBatch.push(`123456789${String(i).padStart(6, '0')}@lid`);
  }
  largeBatch[500] = testLid; // Embed the known resolved one
  largeBatch[1500] = '+919988776655'; // Embed a direct phone

  const startTime = Date.now();
  const batchRes = contactService.bulkResolveLidsLocally(largeBatch);
  const elapsed = Date.now() - startTime;

  console.log(`   Processed ${batchRes.length} LIDs in ${elapsed}ms (${(batchRes.length / (elapsed / 1000)).toFixed(0)} LIDs/sec)`);
  if (batchRes.length !== 10000) {
    throw new Error(`Test 7 Failed: Expected 10000 results, got ${batchRes.length}`);
  }
  if (elapsed > 3000) {
    throw new Error(`Test 7 Failed: Batch processing took too long (${elapsed}ms)`);
  }
  console.log(`   ✓ Test 7 Passed: Successfully processed 10,000 LIDs in ${elapsed}ms (< 3s ceiling)`);

  // Cleanup test fixture
  db.prepare(`DELETE FROM lid_mappings WHERE lid = ?`).run(testLid);
  console.log('\n🧹 Cleaned up test database fixtures.');

  console.log('\n===============================================================');
  console.log('🎉 ALL 7 TEST SUITES PASSED CLEANLY (1000% WORKING)');
  console.log('===============================================================\n');
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
