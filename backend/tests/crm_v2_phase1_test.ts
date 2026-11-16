import { initCrmDatabase, getCrmDb } from '../src/crm/db/index.js';
import { CrmOutboxService } from '../src/crm/services/CrmOutboxService.js';

async function runPhase1Verification() {
  console.log('🧪 Starting CRM V2 Phase 1: Data Foundation Verification...');
  await initCrmDatabase();
  const db = getCrmDb();

  const ws = await db.getUserDefaultWorkspace('test-user-v2-p1');
  console.log(`✅ Default Workspace verified: ${ws.name} (${ws.id})`);

  // 1. Contact Creation & Hot/Cold Tiering (Archiving)
  const uid = Date.now().toString().slice(-4);
  const contact = await db.createContact(ws.id, {
    first_name: 'Satya',
    last_name: 'Nadella',
    email: `satya.${uid}@microsoft.com`,
    phone: `+1425882${uid}`,
    title: 'CEO',
    company_name: 'Microsoft'
  });
  console.log(`✅ Contact created with UUID: ${contact.id}`);

  // Archiving
  const archived = await db.archiveContact(ws.id, contact.id);
  if (!archived) throw new Error('Failed to archive contact');
  const contactCold = await db.getContact(ws.id, contact.id);
  if (!contactCold?.is_archived) throw new Error('Contact is not marked archived');
  console.log('✅ Contact archived to cold tier verified');

  // Unarchiving
  const unarchived = await db.unarchiveContact(ws.id, contact.id);
  if (!unarchived) throw new Error('Failed to unarchive contact');
  const contactHot = await db.getContact(ws.id, contact.id);
  if (contactHot?.is_archived) throw new Error('Contact should not be archived');
  console.log('✅ Contact unarchived back to hot tier verified');

  // 2. Custom Objects Engine
  const customObj = await db.createCustomObject(ws.id, {
    name: `Real Estate Property ${uid}`,
    singular_label: 'Property',
    plural_label: 'Properties',
    slug: `properties_${uid}`,
    description: 'Commercial and residential properties',
    icon: 'Building',
    primary_field_key: 'property_title'
  });
  console.log(`✅ Custom Object created: ${customObj.name} (${customObj.slug})`);

  // Custom Object Typed Fields
  const field1 = await db.createCustomObjectField(ws.id, {
    object_id: customObj.id,
    name: 'Property Title',
    field_key: 'property_title',
    field_type: 'text',
    is_required: true
  });
  const field2 = await db.createCustomObjectField(ws.id, {
    object_id: customObj.id,
    name: 'Valuation',
    field_key: 'valuation',
    field_type: 'currency',
    currency_code: 'USD',
    is_required: true
  });
  console.log(`✅ Custom Fields registered: ${field1.name}, ${field2.name}`);

  // Custom Object Record Creation
  const record = await db.createCustomObjectRecord(ws.id, customObj.id, {
    property_title: 'Silicon Valley Headquarters',
    valuation: 45000000,
    address: 'One Microsoft Way, Redmond'
  });
  console.log(`✅ Custom Object Record created: ${record.id} with title "${record.properties.property_title}"`);

  // Update Record
  const updatedRecord = await db.updateCustomObjectRecord(ws.id, record.id, {
    valuation: 48000000
  });
  if (updatedRecord.properties.valuation !== 48000000) throw new Error('Valuation update failed');
  console.log(`✅ Custom Object Record updated: valuation updated to $${updatedRecord.properties.valuation}`);

  // 3. Object Relationships & Associations
  const rel = await db.createObjectRelationship(ws.id, {
    source_object: 'contact',
    target_object: `properties_${uid}`,
    relationship_type: 'one_to_many',
    name: `Owned Properties ${uid}`,
    inverse_name: 'Owner Contact'
  });
  console.log(`✅ Relationship defined: ${rel.name} (${rel.relationship_type})`);

  const assoc = await db.associateObjects(
    ws.id,
    rel.id,
    'contact',
    contact.id,
    'properties',
    record.id,
    { ownership_share: 100 }
  );
  console.log(`✅ Association linked between contact ${contact.id} and property ${record.id}`);

  const associations = await db.listAssociatedObjects(ws.id, 'contact', contact.id);
  if (associations.length === 0) throw new Error('Association lookup failed');
  console.log(`✅ Found ${associations.length} associated object(s) for contact`);

  // 4. Field-Level Delta History & 1-Click Restore
  await db.updateContact(ws.id, contact.id, {
    title: 'Executive Chairman'
  });
  const history = await db.getFieldHistory(ws.id, 'contact', contact.id);
  console.log(`✅ Field history entries found: ${history.length}`);
  const titleChange = history.find((h) => h.field_name === 'title');
  if (!titleChange) throw new Error('Title delta change not found in history');
  console.log(`   Change detected: ${titleChange.field_name} from "${titleChange.old_value}" -> "${titleChange.new_value}"`);

  // 1-Click Restore previous value
  const restored = await db.restoreFieldHistory(ws.id, titleChange.id);
  if (!restored) throw new Error('Restore failed');
  const restoredContact = await db.getContact(ws.id, contact.id);
  if (restoredContact?.title !== 'CEO') throw new Error(`Title not restored properly: ${restoredContact?.title}`);
  console.log(`✅ Field 1-Click Restore verified: title successfully reverted back to "${restoredContact.title}"`);

  // 5. Transactional Event Outbox & Dispatcher
  const pendingEvents = await db.fetchPendingOutboxEvents(100);
  console.log(`✅ Outbox pending events found in queue: ${pendingEvents.length}`);
  if (pendingEvents.length === 0) throw new Error('No outbox events recorded');

  const outboxService = CrmOutboxService.getInstance();
  const dispatchResult = await outboxService.processPendingEvents(50);
  console.log(`✅ Outbox processing cycle completed: ${dispatchResult.processed} processed, ${dispatchResult.errors} errors`);

  console.log('\n🎉 ALL CRM V2 PHASE 1 DATA FOUNDATION TESTS PASSED PERFECTLY!\n');
}

runPhase1Verification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Phase 1 Verification Failed:', err);
    process.exit(1);
  });
