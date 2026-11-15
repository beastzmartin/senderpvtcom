import assert from 'assert';
import { getDatabase } from '../db/database.js';
import { initFiveSimDatabase } from '../db/fiveSimSchema.js';
import { FiveSimReferenceService } from '../services/virtualNumber/fivesim/FiveSimReferenceService.js';
import { FiveSimDiagnosticsService } from '../services/virtualNumber/fivesim/FiveSimDiagnosticsService.js';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING 5SIM INTEGRATION TEST SUITE (PARTS 8 - 10)');
  console.log('====================================================\n');

  const db = getDatabase();
  initFiveSimDatabase(db);

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // --- Group 1: Reference Slugs & Special Mappings (Part 9) ---
  console.log('--- Test Group 1: Reference Slugs & Aliases Resolution (Part 9) ---');

  const refService = FiveSimReferenceService.getInstance();

  test('Resolves special country slugs correctly', () => {
    assert.strictEqual(refService.resolveCountrySlug('Bhutan'), 'bhutane');
    assert.strictEqual(refService.resolveCountrySlug('Bosnia'), 'bih');
    assert.strictEqual(refService.resolveCountrySlug('Czech Republic'), 'czech');
    assert.strictEqual(refService.resolveCountrySlug('Trinidad and Tobago'), 'tit');
    assert.strictEqual(refService.resolveCountrySlug('Dominican Republic'), 'dominicana');
    assert.strictEqual(refService.resolveCountrySlug('El Salvador'), 'salvador');
    assert.strictEqual(refService.resolveCountrySlug('UK'), 'england');
    assert.strictEqual(refService.resolveCountrySlug('United States'), 'usa');
  });

  test('Resolves special product aliases correctly', () => {
    assert.strictEqual(refService.resolveProductSlug('Blinkit'), 'grofers');
    assert.strictEqual(refService.resolveProductSlug('Alibaba'), 'alipay');
    assert.strictEqual(refService.resolveProductSlug('Samsung Galaxy'), 'galaxy');
    assert.strictEqual(refService.resolveProductSlug('inDrive'), 'indriver');
    assert.strictEqual(refService.resolveProductSlug('Tata 1mg'), '1mg');
    assert.strictEqual(refService.resolveProductSlug('Dropped-Call'), 'blockchain');
    assert.strictEqual(refService.resolveProductSlug('ChatGPT'), 'openai');
    assert.strictEqual(refService.resolveProductSlug('WA Business'), 'whatsapp');
  });

  test('Filters catalog products by category and search', () => {
    const aiServices = refService.getCatalogProducts({ category: 'ai' });
    assert.ok(aiServices.length >= 3);
    assert.ok(aiServices.some((p) => p.slug === 'openai'));

    const searchResults = refService.getCatalogProducts({ search: 'Blinkit' });
    assert.ok(searchResults.length === 1);
    assert.strictEqual(searchResults[0].slug, 'grofers');
  });

  test('Classifies physical vs virtual carriers', () => {
    const v = FiveSimReferenceService.classifyOperator('virtual59');
    assert.strictEqual(v.type, 'virtual');

    const p = FiveSimReferenceService.classifyOperator('vodafone');
    assert.strictEqual(p.type, 'physical');
  });

  // --- Group 2: System Diagnostics & 10-Point Checklist (Part 10) ---
  console.log('\n--- Test Group 2: System Diagnostics & 10-Point Checklist (Part 10) ---');

  const diagService = new FiveSimDiagnosticsService();
  const report = await diagService.runFullDiagnostics();

  test('Diagnostics report contains all 10 checklist items', () => {
    assert.ok(report.checklist.length === 10, `Expected 10 checklist items, got ${report.checklist.length}`);
    const expectedIds = [
      'api_token',
      'remote_connectivity',
      'rating_health',
      'rate_limiting',
      'auto_cancel_shield',
      'no_free_phones_parser',
      'smart_otp_extractor',
      'sqlite_storage',
      'socket_notifications',
      'vendor_suite'
    ];
    for (const id of expectedIds) {
      assert.ok(report.checklist.some((c) => c.id === id), `Missing diagnostic check for: ${id}`);
    }
  });

  test('Diagnostics report provides account stats and sample code snippets', () => {
    assert.ok(typeof report.accountStats === 'object');
    assert.ok('balance' in report.accountStats);
    assert.ok('rating' in report.accountStats);

    assert.ok(report.sampleCodeSnippets.nodejs.includes('5sim.net'));
    assert.ok(report.sampleCodeSnippets.curl.includes('curl'));
    assert.ok(report.sampleCodeSnippets.python.includes('requests.get'));
  });

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

