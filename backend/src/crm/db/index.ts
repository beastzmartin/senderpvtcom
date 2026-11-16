import { CrmStorageAdapter } from './CrmStorageAdapter.js';
import { CrmSqliteAdapter } from './CrmSqliteAdapter.js';

let adapterInstance: CrmStorageAdapter | null = null;

export async function initCrmDatabase(): Promise<CrmStorageAdapter> {
  if (adapterInstance) {
    return adapterInstance;
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.CRM_DATABASE_URL;

  if (databaseUrl) {
    try {
      console.log('🐘 Initializing PostgreSQL CRM Connection Pool...');
      const { CrmPgAdapter } = await import('./CrmPgAdapter.js');
      const pgAdapter = new CrmPgAdapter(databaseUrl);
      await pgAdapter.initialize();
      adapterInstance = pgAdapter;
      console.log('✅ PostgreSQL CRM Connected with 64-way hash partitioning!');
      return pgAdapter;
    } catch (err) {
      console.warn('⚠️ PostgreSQL connection failed, falling back to SQLite CRM adapter:', err);
    }
  }

  console.log('📦 Initializing SQLite CRM Adapter (Local Engine)...');
  const sqliteAdapter = new CrmSqliteAdapter();
  await sqliteAdapter.initialize();
  adapterInstance = sqliteAdapter;
  console.log('✅ SQLite CRM Adapter initialized successfully!');
  return adapterInstance;
}

export function getCrmDb(): CrmStorageAdapter {
  if (!adapterInstance) {
    // Synchronously create SQLite adapter as immediate fallback if not pre-initialized
    const sqliteAdapter = new CrmSqliteAdapter();
    sqliteAdapter.initialize().catch((err) => {
      console.error('Failed to initialize CRM database synchronously:', err);
    });
    adapterInstance = sqliteAdapter;
  }
  return adapterInstance;
}

export * from './CrmStorageAdapter.js';

