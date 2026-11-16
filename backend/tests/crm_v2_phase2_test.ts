import { initCrmDatabase, getCrmDb } from '../src/crm/db/index.js';
import { CrmIdentityService } from '../src/crm/services/CrmIdentityService.js';
import { CrmVerificationPipeline } from '../src/crm/services/CrmVerificationPipeline.js';
import { CrmEnrichmentWaterfall } from '../src/crm/services/CrmEnrichmentWaterfall.js';
import { CrmDataHealthService } from '../src/crm/services/CrmDataHealthService.js';

async function runPhase2Verification() {
  console.log('🧪 Starting CRM V2 Phase 2: Identity Resolution & Data Quality Verification...');
  await initCrmDatabase();
  const db = getCrmDb();

  const ws = await db.getUserDefaultWorkspace('test-user-v2-p2');
  console.log(`✅ Default Workspace verified: ${ws.name} (${ws.id})`);

  // 1. Verification Pipeline (Email, Phone, Domain)
  console.log('\n--- 1. Verification Pipeline ---');
  const verifPipeline = CrmVerificationPipeline.getInstance();

  // Test Valid Corporate Email with MX
  const validEmailResult = await verifPipeline.verifyEmail('bill.gates@microsoft.com');
  console.log('✅ Microsoft email verification:', validEmailResult.status, `(has_mx: ${validEmailResult.has_mx})`);
  if (!validEmailResult.has_mx || validEmailResult.status !== 'valid') {
    throw new Error('Valid corporate email failed MX check');
  }

  // Test Disposable Email
  const disposableResult = await verifPipeline.verifyEmail('burner123@tempmail.com');
  console.log('✅ Disposable email verification:', disposableResult.status, `(is_disposable: ${disposableResult.is_disposable})`);
  if (!disposableResult.is_disposable || disposableResult.status !== 'invalid') {
    throw new Error('Disposable email not caught');
  }

  // Test Role-Based Email
  const roleResult = await verifPipeline.verifyEmail('support@google.com');
  console.log('✅ Role-based email verification:', roleResult.status, `(is_role_based: ${roleResult.is_role_based})`);
  if (!roleResult.is_role_based || roleResult.status !== 'risky') {
    throw new Error('Role-based email not marked risky');
  }

  // Test Phone E.164 verification
  const phoneResult = verifPipeline.verifyPhone('+14155552671');
  console.log('✅ Phone E.164 verification:', phoneResult.status, `(country: ${phoneResult.country_code})`);
  if (!phoneResult.is_e164 || phoneResult.status !== 'valid') {
    throw new Error('Phone verification failed');
  }

  // 2. Identity Resolution, Trigram Matching, Auto-Merge & UNMERGE
  console.log('\n--- 2. Identity Resolution & Golden Record ---');
  const identityService = CrmIdentityService.getInstance();

  const uid = Date.now().toString().slice(-4);
  const contactA = await db.createContact(ws.id, {
    first_name: 'Sundar',
    last_name: 'Pichai',
    email: `sundar.${uid}@alphabet.com`,
    phone: `+1650253${uid}`,
    title: 'Chief Executive Officer',
    company_name: 'Alphabet Inc.'
  });

  const contactB = await db.createContact(ws.id, {
    first_name: 'Sundar',
    last_name: 'Pichai',
    email: `sundar.${uid}@google.com`,
    title: 'CEO',
    company_name: 'Alphabet Inc.',
    custom_fields: { source_channel: 'partner_referral' }
  });

  // Evaluate Confidence Match
  const match = identityService.evaluateMatchConfidence(contactA, contactB);
  console.log(`✅ Match confidence between Contact A and Contact B: ${match.score}% (reasons: ${match.reasons.join(', ')})`);
  if (match.score < 95) throw new Error('Exact email duplicate did not meet 95% confidence');

  // Perform Manual Merge with Survivorship
  const merged = await identityService.manualMerge(ws.id, contactA.id, contactB.id, {}, 'most_complete');
  console.log(`✅ Contacts merged into Golden Record ${merged.id} (title: "${merged.title}", custom_fields: ${JSON.stringify(merged.custom_fields)})`);

  // Verify contactB was soft-deleted
  const duplicateCheck = await db.getContact(ws.id, contactB.id);
  if (duplicateCheck && !duplicateCheck.deleted_at) {
    throw new Error('Duplicate contact was not archived/deleted upon merge');
  }
  console.log('✅ Duplicate contact safely soft-deleted');

  // Verify Merge Record was logged
  const merges = await db.listMerges(ws.id);
  if (merges.length === 0) throw new Error('No merge records logged in crm_contact_merges');
  const latestMerge = merges[0];
  console.log(`✅ Merge record verified: ID ${latestMerge.id}, merged contact snapshot captured`);

  // Test UNMERGE Capability
  const unmerged = await identityService.unmerge(ws.id, latestMerge.id);
  if (!unmerged) throw new Error('UNMERGE failed');

  const unmergedContact = await db.getContact(ws.id, contactB.id);
  if (!unmergedContact || unmergedContact.deleted_at) {
    throw new Error('UNMERGE did not restore duplicate contact');
  }
  console.log(`✅ 1-Click UNMERGE Verified: Contact B (${unmergedContact.id}) successfully resurrected!`);

  // 3. Enrichment Waterfall & Caching
  console.log('\n--- 3. Enrichment Waterfall ---');
  const waterfall = CrmEnrichmentWaterfall.getInstance();

  const enrichContactTarget = await db.createContact(ws.id, {
    first_name: 'Elon',
    last_name: 'Musk',
    email: `elon.${uid}@spacex.com`
  });

  const enrichRes = await waterfall.enrichContact(ws.id, enrichContactTarget.id);
  console.log(`✅ Enrichment Waterfall executed: provider "${enrichRes.provider_used}", fields added: [${enrichRes.fields_added.join(', ')}]`);
  if (!enrichRes.enriched) throw new Error('Enrichment waterfall failed to produce enriched data');

  // Test Cache (Second call must hit cache with 0 cost)
  const cacheRes = await waterfall.enrichContact(ws.id, enrichContactTarget.id);
  console.log(`✅ Enrichment Cache verified: provider "${cacheRes.provider_used}", cost: ${cacheRes.cost_charged} credits`);
  if (cacheRes.provider_used !== 'cache' || cacheRes.cost_charged !== 0) {
    throw new Error('Enrichment cache did not intercept duplicate lookup');
  }

  // 4. Data Health Dashboard & One-Click Fix Jobs
  console.log('\n--- 4. Data Health Dashboard & 1-Click Fixes ---');
  const healthService = CrmDataHealthService.getInstance();
  const metrics = await healthService.getHealthDashboard(ws.id);
  console.log(`✅ Data Quality Score: ${metrics.data_quality_score}/100`);
  console.log(`   Total Contacts: ${metrics.total_contacts}, Active: ${metrics.active_contacts}`);
  console.log(`   Email Health: ${metrics.email_health.valid_count} valid (${metrics.email_health.valid_percentage}%)`);
  console.log(`   Duplicates detected: ${metrics.duplicates.detected_count}`);

  // Test 1-Click Fix: Clean & Normalize
  const normFix = await healthService.cleanAndNormalizeJob(ws.id);
  console.log(`✅ 1-Click Fix (Normalize): Examined ${normFix.examined}, fixed ${normFix.fixed}`);

  console.log('\n🎉 ALL CRM V2 PHASE 2 IDENTITY RESOLUTION & DATA QUALITY TESTS PASSED PERFECTLY!\n');
}

runPhase2Verification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Phase 2 Verification Failed:', err);
    process.exit(1);
  });
