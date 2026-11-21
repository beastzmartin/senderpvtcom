import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const serverRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(serverRoot, '..');

const userDataPath = process.env.USER_DATA_PATH;
const baseDataDir = userDataPath
  ? path.resolve(userDataPath, 'data')
  : path.resolve(serverRoot, 'data');

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'whatsapp-sender-super-secret-jwt-key-change-in-prod',
  defaultAdminUsername: process.env.ADMIN_USERNAME || 'admin',
  defaultAdminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  dataDir: baseDataDir,
  sessionsDir: path.resolve(baseDataDir, 'sessions'),
  dbPath: (() => {
    if (process.env.DB_PATH) {
      if (path.isAbsolute(process.env.DB_PATH)) {
        return process.env.DB_PATH;
      }
      const cleanRel = process.env.DB_PATH.replace(/^(\.\/)?data\//, '').replace(/^(\.\/)?backend\/data\//, '');
      return path.resolve(baseDataDir, cleanRel);
    }
    return path.resolve(baseDataDir, 'whatsapp_messenger.db');
  })(),
  rateLimitWindowMs: 15 * 60 * 1000, // 15 mins
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
};

