import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const newPassword = process.argv[2];
const username = process.argv[3] || 'admin';

if (!newPassword) {
  console.log('\n❌ Usage: npm run reset-password <new_password> [username]');
  console.log('Example: npm run reset-password MyNewSecretPass123');
  console.log('Example for specific user: npm run reset-password MyNewPass123 john\n');
  process.exit(1);
}

// Find database path automatically
const candidates = [
  path.resolve(__dirname, '../data/whatsapp_messenger.db'),
  path.resolve(__dirname, '../../data/whatsapp_messenger.db'),
  path.resolve(process.cwd(), 'data/whatsapp_messenger.db'),
  path.resolve(process.cwd(), 'server/data/whatsapp_messenger.db'),
];

const dbPath = candidates.find(p => fs.existsSync(p));

if (!dbPath) {
  console.error('\n❌ Could not find whatsapp_messenger.db! Checked:\n', candidates.join('\n'));
  process.exit(1);
}

try {
  const db = new Database(dbPath);

  const user = db.prepare('SELECT id, username FROM users WHERE LOWER(username) = LOWER(?)').get(username);
  if (!user) {
    console.error(`\n❌ User "${username}" not found in database (${dbPath}).`);
    process.exit(1);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  const passwordHash = `${salt}:${hash}`;

  db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?').run(passwordHash, user.id);

  console.log('\n=============================================');
  console.log('✅ PASSWORD UPDATED SUCCESSFULLY!');
  console.log(`👤 Username:     ${user.username}`);
  console.log(`🔑 New Password: ${newPassword}`);
  console.log('=============================================\n');
} catch (err) {
  console.error('❌ Error updating password:', err);
  process.exit(1);
}
