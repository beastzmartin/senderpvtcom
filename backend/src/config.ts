import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const serverRoot = path.resolve(__dirname, '..');

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'whatsapp-sender-super-secret-jwt-key-change-in-prod',
  defaultAdminUsername: process.env.ADMIN_USERNAME || 'admin',
  defaultAdminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  dataDir: path.resolve(serverRoot, 'data'),
  sessionsDir: path.resolve(serverRoot, 'data/sessions'),
  dbPath: process.env.DB_PATH
    ? (path.isAbsolute(process.env.DB_PATH) ? process.env.DB_PATH : path.resolve(serverRoot, process.env.DB_PATH))
    : path.resolve(serverRoot, 'data/whatsapp_messenger.db'),
  rateLimitWindowMs: 15 * 60 * 1000, // 15 mins
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
};

