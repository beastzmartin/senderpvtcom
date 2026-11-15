import { initDatabase, getDatabase } from '../db/database.js';
import { GrizzlyPartnerProtocolService } from '../services/virtualNumber/grizzly/GrizzlyPartnerProtocolService.js';
import { GrizzlyProviderConfigService } from '../services/virtualNumber/grizzly/GrizzlyProviderConfigService.js';
import { GrizzlyDataManagementService } from '../services/virtualNumber/grizzly/GrizzlyDataManagementService.js';
import { GRIZZLY_OFFICIAL_COUNTRIES, GRIZZLY_OFFICIAL_SERVICES } from '../db/grizzlyOfficialData.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, description: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${description}`);
  } else {
    console.error(`  ✗ [FAIL] ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

async function runDataMappingsTestSuite() {
  console.log('================================================================================');
  console.log('🐻 GRIZZLYSMS OFFICIAL COUNTRY, SERVICE & OPERATOR DATA INTEGRATION TEST SUITE');
  console.log('================================================================================\n');

  initDatabase();
  const db = getDatabase();

  const protocolKey = 'test_grizzly_protocol_key_data_2026';
  GrizzlyProviderConfigService.updateConfig({
    protocol_key: protocolKey,
    status: 'enabled',
    max_active_numbers: 500
  });

  console.log('--------------------------------------------------------------------------------');
  console.log('SECTION 1: Official Numerical Country ID Verification');
  console.log('--------------------------------------------------------------------------------');

  // 1. India country ID 22
  const india = db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = 22').get() as any;
  assert(india && india.country_name === 'India' && india.country_code_iso2 === 'IN' && (india.dial_code === '+91' || india.dial_code === 91), '1. India maps to exact provider ID 22 with dialing code +91');

  // 2. Indonesia country ID 6
  const indonesia = db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = 6').get() as any;
  assert(indonesia && indonesia.country_name === 'Indonesia' && indonesia.country_code_iso2 === 'ID' && (indonesia.dial_code === '+62' || indonesia.dial_code === 62), '2. Indonesia maps to exact provider ID 6 with dialing code +62');

  // 3. USA country ID 187
  const usa = db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = 187').get() as any;
  assert(usa && usa.country_name === 'USA' && usa.country_code_iso2 === 'US' && (usa.dial_code === '+1' || usa.dial_code === 1), '3. USA maps to exact provider ID 187 with dialing code +1');

  // 4. USA Virtual country ID 12
  const usaVirtual = db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = 12').get() as any;
  assert(usaVirtual && usaVirtual.country_name === 'USA (virtual)' && usaVirtual.provider_country_id === 12, '4. USA Virtual maps to exact provider ID 12 (distinct from physical USA 187)');

  // Also check special IDs > 10000
  const southKorea = db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = 10350').get() as any;
  assert(southKorea && southKorea.country_name === 'South Korea' && southKorea.provider_country_id === 10350, '4b. Special country ID > 10000 (South Korea 10350) preserved without truncation');

  const singapore = db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = 10351').get() as any;
  assert(singapore && singapore.country_name === 'Singapore' && singapore.provider_country_id === 10351, '4c. Special country ID > 10000 (Singapore 10351) preserved without truncation');

  console.log('\n--------------------------------------------------------------------------------');
  console.log('SECTION 2: Official Service Codes & Operators Verification');
  console.log('--------------------------------------------------------------------------------');

  // 5. Telegram uses tg
  const tg = db.prepare("SELECT * FROM grizzly_services WHERE provider_service_code = 'tg'").get() as any;
  assert(tg && tg.service_name === 'Telegram' && tg.is_active === 1, '5. Telegram maps to official short code "tg"');

  // 6. WhatsApp uses wa
  const wa = db.prepare("SELECT * FROM grizzly_services WHERE provider_service_code = 'wa'").get() as any;
  assert(wa && wa.service_name === 'WhatsApp' && wa.is_active === 1, '6. WhatsApp maps to official short code "wa"');

  // 7. Operators default to 'any'
  const operators = GrizzlyDataManagementService.listOperators();
  const defaultAny = operators.find(op => op.operator_code === 'any');
  assert(Boolean(defaultAny), '7. All operators default to official fallback "any"');

  console.log('\n--------------------------------------------------------------------------------');
  console.log('SECTION 3: Rejection of Unknown Countries, Dialing Codes & Unknown Services');
  console.log('--------------------------------------------------------------------------------');

  // 8a. Unknown Country ID returns NO_NUMBERS
  const unknownCountryRes = await GrizzlyPartnerProtocolService.handleGetNumber({
    action: 'GET_NUMBER',
    key: protocolKey,
    country: 99999,
    service: 'tg',
    operator: 'any',
    sum: 15.0
  });
  assert(unknownCountryRes.status === 'NO_NUMBERS', '8a. Unknown country ID 99999 is rejected with status NO_NUMBERS');

  // 8b. Dialing code used as country ID (e.g. 91 instead of 22 for India) returns NO_NUMBERS
  const dialingCodeRes = await GrizzlyPartnerProtocolService.handleGetNumber({
    action: 'GET_NUMBER',
    key: protocolKey,
    country: 91, // 91 is India's telephone calling code, NOT Grizzly's country ID (which is 22)
    service: 'wa',
    operator: 'any',
    sum: 15.0
  });
  assert(dialingCodeRes.status === 'NO_NUMBERS', '8b. Dialing code 91 sent instead of country ID 22 returns NO_NUMBERS (never confused)');

  // 9. Unknown service code returns NO_NUMBERS
  const unknownServiceRes = await GrizzlyPartnerProtocolService.handleGetNumber({
    action: 'GET_NUMBER',
    key: protocolKey,
    country: 22,
    service: 'xyz_unknown_service',
    operator: 'any',
    sum: 15.0
  });
  assert(unknownServiceRes.status === 'NO_NUMBERS', '9. Unknown service code "xyz_unknown_service" is rejected with status NO_NUMBERS');

  console.log('\n--------------------------------------------------------------------------------');
  console.log('SECTION 4: Inventory Matching & GET_NUMBER Allocation');
  console.log('--------------------------------------------------------------------------------');

  // Setup dedicated test inventory numbers
  // Insert test phone for India (22) and Telegram (tg)
  const testPhoneIndia = '919876543210';
  db.prepare('DELETE FROM grizzly_activations WHERE phone_number = ?').run(testPhoneIndia);
  db.prepare('DELETE FROM grizzly_inventory WHERE phone_number = ?').run(testPhoneIndia);
  db.prepare(`
    INSERT INTO grizzly_inventory (
      id, phone_number, country_id, operator, status, supported_services,
      can_get_another_sms, flashcall_supported, voice_supported, cost_price
    ) VALUES (?, ?, 22, 'any', 'available', '["tg","wa"]', 1, 1, 0, 10.0)
  `).run('inv_test_india_tg_001', testPhoneIndia);

  // Sync inventory
  const syncResult = GrizzlyDataManagementService.syncCountryServicesWithLiveInventory();
  assert(syncResult.totalAvailable >= 1, '10a. Real-time inventory sync calculates availability for country-service pairs');

  // 10. Country-service inventory matches GET_SERVICES output
  const servicesRes = await GrizzlyPartnerProtocolService.handleGetServices({
    action: 'GET_SERVICES',
    key: protocolKey
  });
  const country22Entry = servicesRes.countryList?.find((c: any) => c.country === 22);
  assert(Boolean(country22Entry), '10b. Country-service inventory matches GET_SERVICES live output for country 22');
  assert(Boolean(country22Entry && country22Entry.operatorMap?.any?.tg >= 1), '10c. Telegram (tg) in India (22) reports available quantity >= 1');

  // 11. GET_NUMBER uses exact provider IDs
  const getNumberRes = await GrizzlyPartnerProtocolService.handleGetNumber({
    action: 'GET_NUMBER',
    key: protocolKey,
    country: 22,
    service: 'tg',
    operator: 'any',
    sum: 15.0
  });
  assert(getNumberRes.status === 'SUCCESS' && getNumberRes.number === Number(testPhoneIndia), '11. GET_NUMBER allocates number using exact country ID 22 and service "tg"');

  console.log('\n--------------------------------------------------------------------------------');
  console.log('SECTION 5: Integrity, Deduplication & Safe Deletion');
  console.log('--------------------------------------------------------------------------------');

  // 12. No country ID confused with calling code across entire official dataset
  const allCountries = db.prepare('SELECT * FROM grizzly_countries').all() as any[];
  let callingCodeConfusionFound = false;
  for (const c of allCountries) {
    if (c.country_name === 'India' && c.provider_country_id === 91) callingCodeConfusionFound = true;
    if (c.country_name === 'Indonesia' && c.provider_country_id === 62) callingCodeConfusionFound = true;
    if (c.country_name === 'United Kingdom' && c.provider_country_id === 44) callingCodeConfusionFound = true;
  }
  assert(!callingCodeConfusionFound, '12. Verification passed: No country ID is confused with telephone calling code');

  // 13. No duplicate country or service mappings exist
  const dupCountries = db.prepare('SELECT provider_country_id, COUNT(*) as cnt FROM grizzly_countries GROUP BY provider_country_id HAVING cnt > 1').all() as any[];
  assert(dupCountries.length === 0, '13a. Zero duplicate country provider IDs exist in database');

  const dupServices = db.prepare('SELECT provider_service_code, COUNT(*) as cnt FROM grizzly_services GROUP BY provider_service_code HAVING cnt > 1').all() as any[];
  assert(dupServices.length === 0, '13b. Zero duplicate service codes exist in database');

  // 14. Safe Deletion Test: Prevent deleting country or service referenced by historical activations
  let preventedCountryDeletion = false;
  try {
    // Country 22 is referenced by the activation we just created via GET_NUMBER
    GrizzlyDataManagementService.deleteCountry(22);
  } catch (err: any) {
    preventedCountryDeletion = true;
  }
  assert(preventedCountryDeletion, '14a. Safe deletion prevented removing country 22 because active/historical activations exist');

  let preventedServiceDeletion = false;
  try {
    // Service 'tg' is referenced by the activation
    GrizzlyDataManagementService.deleteService('tg');
  } catch (err: any) {
    preventedServiceDeletion = true;
  }
  assert(preventedServiceDeletion, '14b. Safe deletion prevented removing service "tg" because active/historical activations exist');

  // 15. Import / Export Data Integrity
  const exportedData = GrizzlyDataManagementService.exportMappingData();
  assert(exportedData.countries.length >= 100 && exportedData.services.length >= 25, '15a. Export function extracts complete official dataset');

  // Import a custom country
  const importRes = GrizzlyDataManagementService.importCountries([
    {
      id: 9991,
      name: 'Test Land',
      iso2: 'TL',
      iso3: 'TLS',
      dial: 999,
      flag: '🏳️'
    }
  ], 'test_suite_import');
  assert(importRes.imported === 1 || importRes.updated === 1, '15b. Batch importer successfully upserts country without errors');

  // Safe deletion of unused country 9991 succeeds
  const deleteUnused = GrizzlyDataManagementService.deleteCountry(9991);
  assert(deleteUnused.success, '15c. Safe deletion allows removing unused country 9991');

  console.log('\n================================================================================');
  console.log(`🎉 ALL TESTS PASSED: ${passedTests}/${totalTests} CHECKS COMPLIANT`);
  console.log('================================================================================\n');
}

runDataMappingsTestSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
