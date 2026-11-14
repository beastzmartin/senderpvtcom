import { initDatabase, getDatabase } from '../src/db/database.js';
import { ConnectorRegistry } from '../src/services/connectors/ConnectorRegistry.js';
import { LeadService } from '../src/services/leadService.js';
import { ExtractionJobService } from '../src/services/extractionJobService.js';
import { AuthService } from '../src/services/authService.js';

async function runLeadIntelligenceTests() {
  console.log('====================================================');
  console.log('🧪 Starting Lead Intelligence & Extension Tests');
  console.log('====================================================');

  // 1. Initialize DB
  const db = initDatabase();
  console.log('✓ Database initialized with WAL mode and foreign keys.');

  // 2. Verify Tables
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>;
  const tableNames = tables.map(t => t.name);
  console.log('✓ Available tables:', tableNames.filter(n => n.includes('lead') || n.includes('extraction') || n.includes('extension')));

  const requiredTables = ['leads', 'extraction_jobs', 'extraction_sources', 'lead_tags', 'lead_tag_mappings', 'lead_notes', 'extension_sessions'];
  for (const req of requiredTables) {
    if (!tableNames.includes(req)) {
      throw new Error(`Missing required table: ${req}`);
    }
  }
  console.log('✓ All 7 Lead Intelligence & Extension tables verified.');

  // 3. Verify Seeded Extraction Sources
  const sources = db.prepare(`SELECT * FROM extraction_sources`).all() as any[];
  console.log(`✓ Extraction Sources count: ${sources.length} (Expected: 12)`);
  if (sources.length < 12) {
    throw new Error(`Expected at least 12 extraction sources, found ${sources.length}`);
  }

  // 4. Verify Connector Registry
  const registry = ConnectorRegistry.getInstance();
  const allConnectors = registry.getAll();
  console.log(`✓ ConnectorRegistry initialized with ${allConnectors.length} connectors.`);

  const mapsConnector = registry.get('google_maps');
  if (!mapsConnector) throw new Error('Google Maps connector not registered!');

  const normalizedMaps = mapsConnector.normalizeLead({
    business_name: 'Apex Digital Agency Ltd.',
    phone: '+1 (555) 019-2834',
    website: 'https://www.apexdigital.example.com/',
    rating: 4.9,
    reviews_count: 128,
    city: 'New York',
    state: 'NY',
    country: 'USA'
  }, 'test-user-id');

  console.log('✓ Google Maps connector normalized lead:', {
    name: normalizedMaps.business_name,
    phone: normalizedMaps.phone,
    website: normalizedMaps.website,
    rating: normalizedMaps.rating
  });

  if (normalizedMaps.phone !== '+15550192834') {
    throw new Error(`Phone normalization mismatch: expected "+15550192834", got "${normalizedMaps.phone}"`);
  }

  // 5. Verify Test User
  const authService = AuthService.getInstance();
  let users = authService.listUsers();
  let testUser = users[0];

  if (!testUser) {
    const reg = authService.register({
      username: 'leadtester',
      password: 'password123',
      name: 'Lead Intelligence Tester'
    });
    testUser = reg.user;
  }
  console.log(`✓ Using test workspace user: ${testUser.username} (${testUser.id})`);

  // 6. Test LeadService CRUD & Deduplication
  const leadService = LeadService.getInstance();

  const created1 = leadService.createLead(testUser.id, {
    business_name: 'Apex Digital Agency Ltd.',
    phone: '+1 555-019-2834',
    email: 'contact@apexdigital.example.com',
    website: 'https://apexdigital.example.com',
    city: 'New York',
    source: 'google_maps'
  });
  console.log(`✓ Created Lead 1: ID = ${created1.id}`);

  // Test Deduplication (same phone)
  const createdDuplicate = leadService.createLead(testUser.id, {
    business_name: 'Apex Digital Agency Branch',
    phone: '+1 555-019-2834',
    email: 'other@apexdigital.example.com',
    source: 'google_maps'
  });

  if (createdDuplicate.id !== created1.id) {
    throw new Error('Deduplication failed: Duplicate phone should return existing lead!');
  }
  console.log('✓ Deduplication successfully prevented duplicate phone lead insertion.');

  // 7. Test Batch Sync
  const batchRes = leadService.batchCreateLeads(testUser.id, [
    { business_name: 'Blue Horizon Realty', phone: '+1 555-998-1122', city: 'Miami', source: 'google_maps' },
    { business_name: 'Blue Horizon Realty', phone: '+1 555-998-1122', city: 'Miami', source: 'google_maps' }, // duplicate
    { business_name: 'Grand Luxury Hotel', phone: '+44 20 7946 0991', city: 'London', source: 'restaurant_hotel_finder' }
  ]);
  console.log(`✓ Batch sync result: Created = ${batchRes.created.length}, Duplicates = ${batchRes.duplicates}, Failed = ${batchRes.failed}`);

  // 8. Test Filtering & Stats
  const stats = leadService.getLeadStats(testUser.id);
  console.log('✓ Lead Statistics Summary:', stats);

  const queryRes = leadService.listLeads(testUser.id, { hasPhone: true, limit: 10 });
  console.log(`✓ Query leads with phone: Found ${queryRes.total} total leads across ${queryRes.totalPages} pages.`);

  // 9. Test CSV Export
  const csv = leadService.exportLeadsToCsv(testUser.id);
  console.log(`✓ Generated CSV export (${csv.split('\n').length} lines). Header:`, csv.split('\n')[0]);

  // 10. Test Enrichment
  const enriched = leadService.enrichLead(testUser.id, created1.id);
  console.log('✓ Enriched Lead metadata:', enriched.metadata);

  // 11. Test Tags & Notes
  const tag = leadService.createTag(testUser.id, 'High Priority', '#ef4444');
  leadService.tagLead(created1.id, tag.id);
  const note = leadService.addNote(testUser.id, created1.id, 'Initial outreach attempted via WhatsApp.');
  console.log(`✓ Added tag "${tag.name}" and note "${note.content}"`);

  // 12. Test ExtractionJobService
  const jobService = ExtractionJobService.getInstance();
  const job = jobService.createJob(testUser.id, {
    source: 'google_maps',
    keyword: 'Real Estate Agents',
    location: 'Dubai',
    requested_count: 50
  });
  console.log(`✓ Created Extraction Job: ID = ${job.id}, Status = ${job.status}`);

  jobService.startJob(testUser.id, job.id);
  jobService.updateProgress(job.id, 60, 30, 2, 0);
  const runningJob = jobService.getJobById(testUser.id, job.id)!;
  console.log(`✓ Job progress updated: Progress = ${runningJob.current_progress}%, Collected = ${runningJob.collected_count}`);

  jobService.completeJob(job.id, 50, 4, 1);
  const completedJob = jobService.getJobById(testUser.id, job.id)!;
  console.log(`✓ Job marked completed: Status = ${completedJob.status}, Final count = ${completedJob.collected_count}`);

  console.log('====================================================');
  console.log('🎉 ALL LEAD INTELLIGENCE & EXTENSION TESTS PASSED! 🎉');
  console.log('====================================================');
}

runLeadIntelligenceTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
