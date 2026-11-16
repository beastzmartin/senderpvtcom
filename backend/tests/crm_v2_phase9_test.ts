import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { initCrmDatabase, getCrmDb } from '../src/crm/db/index.js';
import { CrmAnalyticsService } from '../src/crm/services/CrmAnalyticsService.js';
import { getDatabase } from '../src/db/database.js';

describe('CRM V2 Phase 9: Analytics, Funnels, Attribution & Cohorts', () => {
  let wsId: string;
  const analyticsService = CrmAnalyticsService.getInstance();

  before(async () => {
    const crmDb = await initCrmDatabase();
    const rawDb = getDatabase();

    const existingUser = rawDb.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
    const userId = existingUser ? existingUser.id : 'user_p9_' + Date.now();
    if (!existingUser) {
      rawDb.prepare(`INSERT INTO users (id, username, password_hash, role) VALUES (?, 'p9tester', 'pwd', 'admin')`).run(userId);
    }

    const ws = await crmDb.createWorkspace(userId, 'Analytics WS ' + Date.now());
    wsId = ws.id;

    // 1. Create contacts across different acquisition sources and countries
    const contactA = await crmDb.createContact(wsId, {
      first_name: 'Aditi',
      last_name: 'Sharma',
      email: 'aditi@sharma.in',
      phone: '+919876543210',
      country: 'India',
      source: 'meta_ad'
    });

    const contactB = await crmDb.createContact(wsId, {
      first_name: 'Brian',
      last_name: 'Miller',
      email: 'brian@miller.us',
      phone: '+14155552671',
      country: 'United States',
      source: 'extractor_job'
    });

    const contactC = await crmDb.createContact(wsId, {
      first_name: 'Chloe',
      last_name: 'Dupont',
      email: 'chloe@dupont.fr',
      phone: '+33612345678',
      country: 'France',
      source: 'meta_ad'
    });

    const contactD = await crmDb.createContact(wsId, {
      first_name: 'Dev',
      last_name: 'Patel',
      email: 'dev@patel.in',
      phone: '+919998887776',
      country: 'India',
      source: 'referral'
    });

    // 2. Fetch default pipeline and stages
    const pipelines = await crmDb.listPipelines(wsId);
    const pipeline = pipelines[0];
    const stages = await crmDb.listPipelineStages(wsId, pipeline.id);

    const stageLead = stages.find(s => s.name === 'Lead In')!;
    const stageDiscovery = stages.find(s => s.name === 'Discovery')!;
    const stageWon = stages.find(s => s.name === 'Closed Won')!;

    // 3. Create deals
    // Deal 1: Won deal for contact A (meta_ad) - $5000
    await crmDb.createDeal(wsId, {
      pipeline_id: pipeline.id,
      stage_id: stageWon.id,
      contact_id: contactA.id,
      name: 'Deal Aditi Enterprise',
      amount: 5000,
      amount_usd: 5000,
      currency: 'USD',
      status: 'won'
    });

    // Deal 2: Won deal for contact B (extractor_job) - $3000
    await crmDb.createDeal(wsId, {
      pipeline_id: pipeline.id,
      stage_id: stageWon.id,
      contact_id: contactB.id,
      name: 'Deal Brian Starter',
      amount: 3000,
      amount_usd: 3000,
      currency: 'USD',
      status: 'won'
    });

    // Deal 3: Open deal for contact C in Discovery - $2000
    await crmDb.createDeal(wsId, {
      pipeline_id: pipeline.id,
      stage_id: stageDiscovery.id,
      contact_id: contactC.id,
      name: 'Deal Chloe Expansion',
      amount: 2000,
      amount_usd: 2000,
      currency: 'USD',
      status: 'open'
    });

    // Deal 4: Open deal for contact D in Lead In - $1500
    await crmDb.createDeal(wsId, {
      pipeline_id: pipeline.id,
      stage_id: stageLead.id,
      contact_id: contactD.id,
      name: 'Deal Dev Trial',
      amount: 1500,
      amount_usd: 1500,
      currency: 'USD',
      status: 'open'
    });

    // 4. Create activities for cohorts
    await crmDb.logActivity(wsId, {
      contact_id: contactA.id,
      user_id: userId,
      type: 'call',
      title: 'Intro Call with Aditi',
      details: { outcome: 'interested' }
    });

    await crmDb.logActivity(wsId, {
      contact_id: contactB.id,
      user_id: userId,
      type: 'email',
      title: 'Sent Proposal to Brian',
      details: { template: 'b2b_v1' }
    });
  });

  it('computes pipeline funnel metrics with stage conversion and drop-off rates', async () => {
    const funnel = await analyticsService.getFunnelMetrics(wsId);

    assert.ok(funnel.pipeline_id, 'Has pipeline_id');
    assert.strictEqual(funnel.stages.length, 6, 'Should have 6 stages');

    const leadStage = funnel.stages.find(s => s.stage_name === 'Lead In');
    const discoveryStage = funnel.stages.find(s => s.stage_name === 'Discovery');
    const wonStage = funnel.stages.find(s => s.stage_name === 'Closed Won');

    assert.ok(leadStage, 'Lead stage found');
    assert.ok(discoveryStage, 'Discovery stage found');
    assert.ok(wonStage, 'Won stage found');

    assert.strictEqual(leadStage?.deal_count, 1);
    assert.strictEqual(discoveryStage?.deal_count, 1);
    assert.strictEqual(wonStage?.deal_count, 2);
    assert.strictEqual(wonStage?.total_value_usd, 8000); // 5000 + 3000

    // 2 won out of 4 total deals = 50% overall win rate
    assert.strictEqual(funnel.overall_win_rate, 50);

    // Win rate by source
    assert.strictEqual(funnel.win_rate_by_source['meta_ad'], 50); // 1 won out of 2 deals
    assert.strictEqual(funnel.win_rate_by_source['extractor_job'], 100); // 1 won out of 1 deal
  });

  it('computes acquisition attribution metrics across channels', async () => {
    const attribution = await analyticsService.getAttributionMetrics(wsId);

    assert.strictEqual(attribution.total_contacts, 4);
    assert.strictEqual(attribution.total_won_value_usd, 8000);

    const metaAdRow = attribution.by_source.find(s => s.source === 'meta_ad');
    const extractorRow = attribution.by_source.find(s => s.source === 'extractor_job');
    const referralRow = attribution.by_source.find(s => s.source === 'referral');

    assert.ok(metaAdRow, 'meta_ad row found');
    assert.strictEqual(metaAdRow?.contacts_count, 2);
    assert.strictEqual(metaAdRow?.deals_count, 2);
    assert.strictEqual(metaAdRow?.won_value_usd, 5000);
    assert.strictEqual(metaAdRow?.conversion_rate, 100); // 2 deals for 2 contacts = 100%

    assert.ok(extractorRow, 'extractor_job row found');
    assert.strictEqual(extractorRow?.contacts_count, 1);
    assert.strictEqual(extractorRow?.deals_count, 1);
    assert.strictEqual(extractorRow?.won_value_usd, 3000);

    assert.ok(referralRow, 'referral row found');
    assert.strictEqual(referralRow?.contacts_count, 1);
    assert.strictEqual(referralRow?.won_value_usd, 0);
  });

  it('computes cohort retention across 30/60/90-day activity intervals', async () => {
    const cohorts = await analyticsService.getCohortRetention(wsId, 3);

    assert.ok(Array.isArray(cohorts), 'Cohorts is an array');
    assert.ok(cohorts.length >= 1, 'At least current month cohort exists');

    const currentCohort = cohorts[0];
    assert.ok(currentCohort.cohort_month, 'Cohort month present');
    assert.strictEqual(currentCohort.total_contacts, 4);
    // Contacts A and B had activities created right after creation (Month 0: 0-30 days)
    // 2 out of 4 contacts active = 50%
    assert.strictEqual(currentCohort.active_m0_pct, 50);
  });

  it('generates multi-dimensional custom reports with aggregations and CSV export', async () => {
    // 1. Country dimension report with count and total_deal_value
    const reportByCountry = await analyticsService.runCustomReport(wsId, {
      dimension: 'country',
      metrics: ['count', 'total_deal_value', 'avg_deal_value'],
      chart_type: 'bar'
    });

    assert.strictEqual(reportByCountry.dimension, 'country');
    assert.strictEqual(reportByCountry.chart_type, 'bar');
    assert.ok(reportByCountry.rows.length >= 3, 'India, US, France');

    const indiaRow = reportByCountry.rows.find(r => r.dimension_value === 'India');
    assert.ok(indiaRow, 'India row found');
    assert.strictEqual(indiaRow?.metrics.count, 2);
    assert.strictEqual(indiaRow?.metrics.total_deal_value, 6500); // 5000 + 1500

    // 2. Stage dimension report
    const reportByStage = await analyticsService.runCustomReport(wsId, {
      dimension: 'stage',
      metrics: ['count', 'total_deal_value'],
      chart_type: 'funnel'
    });

    assert.strictEqual(reportByStage.dimension, 'stage');
    assert.strictEqual(reportByStage.chart_type, 'funnel');
    const closedWonRow = reportByStage.rows.find(r => r.dimension_value === 'Closed Won');
    assert.strictEqual(closedWonRow?.metrics.count, 2);
    assert.strictEqual(closedWonRow?.metrics.total_deal_value, 8000);

    // 3. RFC-4180 CSV export verification
    const csv = analyticsService.exportReportCsv(reportByCountry);
    assert.ok(csv.includes('"country","count","total_deal_value","avg_deal_value"'), 'Has CSV headers');
    assert.ok(csv.includes('"India"'), 'Has India row in CSV');
    assert.ok(csv.includes('6500'), 'Has value 6500 in CSV');
  });
});
