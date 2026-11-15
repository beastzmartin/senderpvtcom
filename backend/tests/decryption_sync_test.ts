import { initDatabase, getDatabase } from '../src/db/database.js';
import { BaileysWhatsAppProvider } from '../src/services/whatsapp/BaileysProvider.js';
import { MessageService } from '../src/services/messageService.js';
import { ContactService } from '../src/services/contactService.js';
import { WhatsAppManager } from '../src/services/whatsapp/WhatsAppManager.js';
import { proto } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import { config } from '../src/config.js';

async function runDecryptionAndSyncTests() {
  console.log('=== STARTING BAILEYS DECRYPTION & SYNCHRONIZATION TEST SUITE ===\n');

  initDatabase();
  const db = getDatabase();
  const provider = new BaileysWhatsAppProvider();
  const contactService = ContactService.getInstance();
  const messageService = MessageService.getInstance();

  // Test 1: Message Caching & getMessage (Resolving "Waiting for this message")
  console.log('Test 1: Testing getMessage handler & retry store...');
  const testMsgId = `test_msg_${Date.now()}`;
  const testRemoteJid = '919876543210@s.whatsapp.net';
  const testProtoMessage: proto.IMessage = {
    conversation: 'Hello, this is a secret encrypted payload!'
  };

  // Cache message in provider
  provider.cacheMessage(testMsgId, testRemoteJid, testProtoMessage);

  // Retrieve via getMessage
  const retrievedFromCache = await provider.getMessage({
    id: testMsgId,
    remoteJid: testRemoteJid,
    fromMe: true
  });

  if (!retrievedFromCache || retrievedFromCache.conversation !== testProtoMessage.conversation) {
    throw new Error('getMessage failed to retrieve message from cache!');
  }
  console.log('✅ getMessage successfully retrieved message from memory cache:', retrievedFromCache.conversation);

  // Test 2: getMessage DB Fallback
  console.log('\nTest 2: Testing getMessage fallback to SQLite database...');
  const dbMsgId = `db_msg_${Date.now()}`;
  const dbRemoteJid = '919123456789@s.whatsapp.net';
  const dbProtoMessage: proto.IMessage = {
    conversation: 'Message stored in database fallback'
  };

  // Insert conversation and message in DB
  const conv = messageService.getOrCreateConversation(dbRemoteJid, 'phone', 'DB Test Contact');
  const insertStmt = db.prepare(`
    INSERT INTO messages (
      id, conversation_id, sender_identifier, recipient_identifier,
      identifier_type, body, direction, status, provider_message_id,
      provider_response, timestamp, created_at
    ) VALUES (?, ?, ?, ?, 'phone', ?, 'outgoing', 'sent', ?, ?, datetime('now'), datetime('now'))
  `);
  insertStmt.run(
    dbMsgId,
    conv.id,
    'me',
    dbRemoteJid,
    dbProtoMessage.conversation,
    dbMsgId,
    JSON.stringify({ message: dbProtoMessage })
  );

  const retrievedFromDb = await provider.getMessage({
    id: dbMsgId,
    remoteJid: dbRemoteJid,
    fromMe: true
  });

  if (!retrievedFromDb || retrievedFromDb.conversation !== dbProtoMessage.conversation) {
    throw new Error('getMessage failed to retrieve message from database fallback!');
  }
  console.log('✅ getMessage successfully retrieved message from DB fallback:', retrievedFromDb.conversation);

  // Test 3: CIPHERTEXT placeholder resolution
  console.log('\nTest 3: Testing CIPHERTEXT undecrypted message handling & resolution...');
  const cipherMsgId = `cipher_${Date.now()}`;
  const senderPhone = '+919999888877';

  // Step A: Message arrives undecrypted (CIPHERTEXT)
  const initialCipherEvent = {
    providerMessageId: cipherMsgId,
    from: `${senderPhone.replace('+', '')}@s.whatsapp.net`,
    senderIdentifier: senderPhone,
    identifierType: 'phone' as const,
    body: 'Waiting for this message. This may take a while. Learn More',
    timestamp: new Date().toISOString(),
    fromMe: false
  };

  const initialRecord = await messageService.handleIncomingMessage(initialCipherEvent);
  if (!initialRecord.body.includes('Waiting for this message')) {
    throw new Error('Initial CIPHERTEXT message was not saved with waiting placeholder!');
  }
  console.log('✅ Undecrypted message stored with waiting placeholder. Status:', initialRecord.status);

  // Step B: Sender/phone delivers decrypted content
  const decryptedText = 'Decrypted successfully after key exchange!';
  const updateEvent = {
    providerMessageId: cipherMsgId,
    remoteJid: `${senderPhone.replace('+', '')}@s.whatsapp.net`,
    senderIdentifier: senderPhone,
    identifierType: 'phone' as const,
    body: decryptedText,
    timestamp: new Date().toISOString(),
    rawMessage: { conversation: decryptedText }
  };

  const resolvedRecord = await messageService.handleMessageContentUpdate(updateEvent);
  if (!resolvedRecord || resolvedRecord.body !== decryptedText) {
    throw new Error(`Message was not resolved with decrypted text! Got: ${resolvedRecord?.body}`);
  }
  console.log('✅ Undecrypted message successfully updated to decrypted text:', resolvedRecord.body);

  // Verify DB record was updated
  const reloaded = db.prepare('SELECT body, status FROM messages WHERE id = ?').get(initialRecord.id) as { body: string; status: string };
  if (reloaded.body !== decryptedText) {
    throw new Error('Database message record did not reflect decrypted content!');
  }
  console.log('✅ Verified SQLite message record was updated in place.');

  // Test 4: LID Mappings and Cross-Referencing
  console.log('\nTest 4: Testing bi-directional LID mappings & contact cross-linking...');
  const testLid = '12345678901234@lid';
  const testPhone = '+919811223344';

  contactService.createContact({
    name: 'CrossLink Contact',
    phone_number: testPhone,
    notes: 'Phone first'
  });

  // Upsert LID mapping
  contactService.upsertLidMapping(testLid, testPhone, `${testPhone.replace('+', '')}@s.whatsapp.net`, 'CrossLink Contact');

  const mappedPhone = contactService.getPhoneForLid(testLid);
  const mappedLid = contactService.getLidForPhone(testPhone);

  if (mappedPhone !== testPhone || mappedLid !== testLid) {
    throw new Error(`LID mapping failed! Expected ${testPhone} <-> ${testLid}, got ${mappedPhone} <-> ${mappedLid}`);
  }
  console.log(`✅ Bi-directional mapping verified: ${testLid} <-> ${testPhone}`);

  // Check if contact record in SQLite now has the LID
  const contactRow = db.prepare('SELECT lid FROM contacts WHERE phone_number = ?').get(testPhone) as { lid: string | null };
  if (contactRow.lid !== testLid) {
    throw new Error(`Contact record did not get updated with mapped LID! Got: ${contactRow.lid}`);
  }
  console.log('✅ Contact table automatically cross-linked with LID:', contactRow.lid);

  // Test 5: Verify credentials persistence
  console.log('\nTest 5: Checking credentials persistence...');
  const sessionDir = path.resolve(config.sessionsDir, 'baileys_default');
  fs.mkdirSync(sessionDir, { recursive: true });
  const credsFile = path.join(sessionDir, 'creds.json');
  if (!fs.existsSync(credsFile)) {
    fs.writeFileSync(credsFile, JSON.stringify({ noiseKey: {}, registrationId: 12345 }), 'utf8');
  }
  console.log('✅ Session creds.json exists and is preserved at:', credsFile);

  // Disconnect provider and verify files are NOT cleared
  await provider.disconnect();
  if (!fs.existsSync(credsFile)) {
    throw new Error('disconnect() deleted session files!');
  }
  console.log('✅ Verified provider.disconnect() safely preserved session credentials and keys.');

  console.log('\n=== ALL DECRYPTION & SYNCHRONIZATION TESTS PASSED! ===');
}

runDecryptionAndSyncTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

