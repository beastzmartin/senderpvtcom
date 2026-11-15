import crypto from 'crypto';
import { getDatabase } from '../../../db/database.js';
import {
  GRIZZLY_OFFICIAL_COUNTRIES,
  GRIZZLY_OFFICIAL_SERVICES,
  GRIZZLY_OFFICIAL_OPERATORS,
  OfficialCountryData,
  OfficialServiceData
} from '../../../db/grizzlyOfficialData.js';
import { GrizzlyPartnerProtocolService } from './GrizzlyPartnerProtocolService.js';

export class GrizzlyDataManagementService {
  /**
   * List countries from official registry with filtering & pagination
   */
  public static listCountries(params?: {
    search?: string;
    activeOnly?: boolean;
    supportedOnly?: boolean;
    limit?: number;
    offset?: number;
  }): { total: number; rows: any[] } {
    const db = getDatabase();
    let whereClauses: string[] = ['1=1'];
    const args: any[] = [];

    if (params?.search) {
      const s = `%${params.search.trim().toLowerCase()}%`;
      whereClauses.push('(LOWER(country_name) LIKE ? OR LOWER(country_code_iso2) LIKE ? OR CAST(provider_country_id AS TEXT) LIKE ?)');
      args.push(s, s, s);
    }

    if (params?.activeOnly) {
      whereClauses.push('is_active = 1');
    }

    if (params?.supportedOnly) {
      whereClauses.push('is_supported = 1');
    }

    const whereStr = whereClauses.join(' AND ');
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM grizzly_countries WHERE ${whereStr}`).get(...args) as any;
    const total = countRow?.total || 0;

    const limit = params?.limit ? Math.min(Math.max(params.limit, 1), 500) : 100;
    const offset = params?.offset ? Math.max(params.offset, 0) : 0;

    const rows = db.prepare(`
      SELECT * FROM grizzly_countries
      WHERE ${whereStr}
      ORDER BY country_name ASC
      LIMIT ? OFFSET ?
    `).all(...args, limit, offset);

    return { total, rows };
  }

  /**
   * Toggle Country Active / Supported Status
   */
  public static toggleCountry(providerCountryId: number, isActive: boolean, isSupported?: boolean): any {
    const db = getDatabase();
    const current = db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = ?').get(providerCountryId) as any;
    if (!current) {
      throw new Error(`Country with provider ID ${providerCountryId} not found.`);
    }

    const newActive = isActive ? 1 : 0;
    const newSupported = isSupported !== undefined ? (isSupported ? 1 : 0) : current.is_supported;

    db.prepare(`
      UPDATE grizzly_countries
      SET is_active = ?, is_supported = ?, updated_at = datetime('now')
      WHERE provider_country_id = ?
    `).run(newActive, newSupported, providerCountryId);

    // Keep grizzly_country_mappings in sync
    db.prepare(`
      UPDATE grizzly_country_mappings
      SET is_enabled = ?, updated_at = datetime('now')
      WHERE grizzly_country_id = ?
    `).run(newActive, providerCountryId);

    GrizzlyPartnerProtocolService.invalidateCache();
    return db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = ?').get(providerCountryId);
  }

  /**
   * Update or Add Country Record
   */
  public static updateCountry(providerCountryId: number, data: Partial<OfficialCountryData>): any {
    const db = getDatabase();
    const current = db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = ?').get(providerCountryId) as any;

    if (current) {
      db.prepare(`
        UPDATE grizzly_countries
        SET country_name = COALESCE(?, country_name),
            country_code_iso2 = COALESCE(?, country_code_iso2),
            country_code_iso3 = COALESCE(?, country_code_iso3),
            flag = COALESCE(?, flag),
            dial_code = COALESCE(?, dial_code),
            updated_at = datetime('now')
        WHERE provider_country_id = ?
      `).run(
        data.country_name || null,
        data.country_code_iso2 || null,
        data.country_code_iso3 || null,
        data.flag || null,
        data.dial_code || null,
        providerCountryId
      );
    } else {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO grizzly_countries (
          id, provider_country_id, country_name, country_code_iso2, country_code_iso3, flag, dial_code, is_active, is_supported
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
      `).run(
        id,
        providerCountryId,
        data.country_name || `Country ${providerCountryId}`,
        data.country_code_iso2 || 'XX',
        data.country_code_iso3 || 'XXX',
        data.flag || '🌐',
        data.dial_code || ''
      );
    }

    GrizzlyPartnerProtocolService.invalidateCache();
    return db.prepare('SELECT * FROM grizzly_countries WHERE provider_country_id = ?').get(providerCountryId);
  }

  /**
   * Safe Delete Country: Prevent accidental deletion of countries referenced by historical activations
   */
  public static deleteCountry(providerCountryId: number): { success: boolean; message: string } {
    const db = getDatabase();

    // Check historical activations
    const activationRefs = (db.prepare(`
      SELECT COUNT(*) as c FROM grizzly_activations WHERE country_id = ?
    `).get(providerCountryId) as any)?.c || 0;

    if (activationRefs > 0) {
      throw new Error(`Cannot delete country ID ${providerCountryId}: Referenced by ${activationRefs} historical activations. Deactivate the country instead.`);
    }

    // Check inventory
    const inventoryRefs = (db.prepare(`
      SELECT COUNT(*) as c FROM grizzly_inventory WHERE country_id = ?
    `).get(providerCountryId) as any)?.c || 0;

    if (inventoryRefs > 0) {
      throw new Error(`Cannot delete country ID ${providerCountryId}: Referenced by ${inventoryRefs} inventory numbers. Deactivate or reassign inventory first.`);
    }

    db.prepare('DELETE FROM grizzly_country_services WHERE provider_country_id = ?').run(providerCountryId);
    db.prepare('DELETE FROM grizzly_country_mappings WHERE grizzly_country_id = ?').run(providerCountryId);
    db.prepare('DELETE FROM grizzly_countries WHERE provider_country_id = ?').run(providerCountryId);

    GrizzlyPartnerProtocolService.invalidateCache();
    return { success: true, message: `Country ID ${providerCountryId} safely deleted.` };
  }

  /**
   * Batch Import Countries (JSON / CSV payload)
   */
  public static importCountries(countriesList: any[], fileName?: string): { imported: number; updated: number; total: number } {
    const db = getDatabase();
    let imported = 0;
    let updated = 0;

    const upsertCountry = db.prepare(`
      INSERT INTO grizzly_countries (
        id, provider_country_id, country_name, country_code_iso2, country_code_iso3, flag, dial_code, is_active, is_supported, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(provider_country_id) DO UPDATE SET
        country_name = excluded.country_name,
        country_code_iso2 = excluded.country_code_iso2,
        country_code_iso3 = excluded.country_code_iso3,
        flag = excluded.flag,
        dial_code = excluded.dial_code,
        is_active = excluded.is_active,
        is_supported = excluded.is_supported,
        last_synced_at = datetime('now'),
        updated_at = datetime('now')
    `);

    const upsertMapping = db.prepare(`
      INSERT INTO grizzly_country_mappings (id, grizzly_country_id, iso_code, country_name, dial_code, flag_emoji, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(grizzly_country_id) DO UPDATE SET
        country_name = excluded.country_name,
        iso_code = excluded.iso_code,
        dial_code = excluded.dial_code,
        flag_emoji = excluded.flag_emoji,
        updated_at = datetime('now')
    `);

    const checkStmt = db.prepare('SELECT id FROM grizzly_countries WHERE provider_country_id = ?');

    const tx = db.transaction(() => {
      for (const raw of countriesList) {
        const provId = parseInt(String(raw.provider_country_id ?? raw.id ?? raw.country_id), 10);
        if (isNaN(provId)) continue;

        const name = String(raw.country_name ?? raw.name ?? `Country ${provId}`).trim();
        const iso2 = String(raw.country_code_iso2 ?? raw.iso_code ?? raw.iso ?? 'XX').toUpperCase().trim();
        const iso3 = String(raw.country_code_iso3 ?? raw.iso3 ?? '').toUpperCase().trim();
        const dial = String(raw.dial_code ?? raw.dial ?? '').trim();
        const flag = String(raw.flag ?? raw.flag_emoji ?? '🌐').trim();
        const isActive = raw.is_active !== undefined ? (raw.is_active ? 1 : 0) : 1;
        const isSupported = raw.is_supported !== undefined ? (raw.is_supported ? 1 : 0) : 1;

        const exists = checkStmt.get(provId);
        if (exists) {
          updated++;
        } else {
          imported++;
        }

        const id = crypto.randomUUID();
        upsertCountry.run(id, provId, name, iso2, iso3, flag, dial, isActive, isSupported);
        upsertMapping.run(id, provId, iso2, name, dial, flag);
      }

      // Log import
      db.prepare(`
        INSERT INTO grizzly_data_imports (id, import_type, file_name, records_count, status)
        VALUES (?, 'countries', ?, ?, 'completed')
      `).run(crypto.randomUUID(), fileName || 'countries_import.json', imported + updated);
    });

    tx();
    GrizzlyPartnerProtocolService.invalidateCache();
    return { imported, updated, total: imported + updated };
  }

  /**
   * List Services from official registry
   */
  public static listServices(params?: {
    search?: string;
    category?: string;
    activeOnly?: boolean;
    supportedOnly?: boolean;
  }): { total: number; rows: any[] } {
    const db = getDatabase();
    let whereClauses: string[] = ['1=1'];
    const args: any[] = [];

    if (params?.search) {
      const s = `%${params.search.trim().toLowerCase()}%`;
      whereClauses.push('(LOWER(service_name) LIKE ? OR LOWER(display_name) LIKE ? OR LOWER(provider_service_code) LIKE ?)');
      args.push(s, s, s);
    }

    if (params?.category) {
      whereClauses.push('category = ?');
      args.push(params.category.trim().toLowerCase());
    }

    if (params?.activeOnly) {
      whereClauses.push('is_active = 1');
    }

    if (params?.supportedOnly) {
      whereClauses.push('is_supported = 1');
    }

    const whereStr = whereClauses.join(' AND ');
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM grizzly_services WHERE ${whereStr}`).get(...args) as any;
    const total = countRow?.total || 0;

    const rows = db.prepare(`
      SELECT * FROM grizzly_services
      WHERE ${whereStr}
      ORDER BY service_name ASC
    `).all(...args);

    return { total, rows };
  }

  /**
   * Toggle Service Active / Supported Status
   */
  public static toggleService(serviceCode: string, isActive: boolean, isSupported?: boolean): any {
    const db = getDatabase();
    const cleanCode = serviceCode.trim().toLowerCase();
    const current = db.prepare('SELECT * FROM grizzly_services WHERE provider_service_code = ?').get(cleanCode) as any;

    if (!current) {
      throw new Error(`Service with code "${cleanCode}" not found.`);
    }

    const newActive = isActive ? 1 : 0;
    const newSupported = isSupported !== undefined ? (isSupported ? 1 : 0) : current.is_supported;

    db.prepare(`
      UPDATE grizzly_services
      SET is_active = ?, is_supported = ?, updated_at = datetime('now')
      WHERE provider_service_code = ?
    `).run(newActive, newSupported, cleanCode);

    // Keep grizzly_service_mappings in sync
    db.prepare(`
      UPDATE grizzly_service_mappings
      SET is_enabled = ?
      WHERE service_code = ?
    `).run(newActive, cleanCode);

    GrizzlyPartnerProtocolService.invalidateCache();
    return db.prepare('SELECT * FROM grizzly_services WHERE provider_service_code = ?').get(cleanCode);
  }

  /**
   * Add or Update Service
   */
  public static addOrUpdateService(data: OfficialServiceData): any {
    const db = getDatabase();
    const cleanCode = data.provider_service_code.trim().toLowerCase();

    if (!cleanCode || cleanCode.length < 2 || cleanCode.length > 8) {
      throw new Error('Service code must be between 2 and 8 characters (e.g. tg, wa, go).');
    }

    const current = db.prepare('SELECT * FROM grizzly_services WHERE provider_service_code = ?').get(cleanCode) as any;

    if (current) {
      db.prepare(`
        UPDATE grizzly_services
        SET service_name = ?,
            display_name = ?,
            icon = COALESCE(?, icon),
            category = COALESCE(?, category),
            updated_at = datetime('now')
        WHERE provider_service_code = ?
      `).run(
        data.service_name,
        data.display_name,
        data.icon || null,
        data.category || null,
        cleanCode
      );
    } else {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO grizzly_services (
          id, provider_service_code, service_name, display_name, icon, category, is_active, is_supported
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 1)
      `).run(
        id,
        cleanCode,
        data.service_name,
        data.display_name,
        data.icon || 'Send',
        data.category || 'general'
      );

      // Keep grizzly_service_mappings in sync
      db.prepare(`
        INSERT INTO grizzly_service_mappings (id, service_code, name, category, is_enabled)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(service_code) DO NOTHING
      `).run(id, cleanCode, data.display_name, data.category || 'general');
    }

    GrizzlyPartnerProtocolService.invalidateCache();
    return db.prepare('SELECT * FROM grizzly_services WHERE provider_service_code = ?').get(cleanCode);
  }

  /**
   * Safe Delete Service: Prevent deletion if historical activations exist
   */
  public static deleteService(serviceCode: string): { success: boolean; message: string } {
    const db = getDatabase();
    const cleanCode = serviceCode.trim().toLowerCase();

    // Check activations
    const activationRefs = (db.prepare(`
      SELECT COUNT(*) as c FROM grizzly_activations WHERE LOWER(service) = ?
    `).get(cleanCode) as any)?.c || 0;

    if (activationRefs > 0) {
      throw new Error(`Cannot delete service "${cleanCode}": Referenced by ${activationRefs} historical activations. Deactivate the service instead.`);
    }

    db.prepare('DELETE FROM grizzly_country_services WHERE provider_service_code = ?').run(cleanCode);
    db.prepare('DELETE FROM grizzly_service_mappings WHERE service_code = ?').run(cleanCode);
    db.prepare('DELETE FROM grizzly_services WHERE provider_service_code = ?').run(cleanCode);

    GrizzlyPartnerProtocolService.invalidateCache();
    return { success: true, message: `Service "${cleanCode}" safely deleted.` };
  }

  /**
   * Batch Import Services
   */
  public static importServices(servicesList: any[], fileName?: string): { imported: number; updated: number; total: number } {
    const db = getDatabase();
    let imported = 0;
    let updated = 0;

    const upsertService = db.prepare(`
      INSERT INTO grizzly_services (
        id, provider_service_code, service_name, display_name, icon, category, is_active, is_supported, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(provider_service_code) DO UPDATE SET
        service_name = excluded.service_name,
        display_name = excluded.display_name,
        icon = excluded.icon,
        category = excluded.category,
        is_active = excluded.is_active,
        is_supported = excluded.is_supported,
        last_synced_at = datetime('now'),
        updated_at = datetime('now')
    `);

    const upsertMapping = db.prepare(`
      INSERT INTO grizzly_service_mappings (id, service_code, name, category, is_enabled)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(service_code) DO UPDATE SET
        name = excluded.name,
        category = excluded.category
    `);

    const checkStmt = db.prepare('SELECT id FROM grizzly_services WHERE provider_service_code = ?');

    const tx = db.transaction(() => {
      for (const raw of servicesList) {
        const code = String(raw.provider_service_code ?? raw.code ?? raw.service_code).trim().toLowerCase();
        if (!code || code.length < 2) continue;

        const sName = String(raw.service_name ?? raw.name ?? code).trim();
        const dName = String(raw.display_name ?? raw.title ?? sName).trim();
        const icon = String(raw.icon ?? 'Send').trim();
        const cat = String(raw.category ?? 'general').trim().toLowerCase();
        const isActive = raw.is_active !== undefined ? (raw.is_active ? 1 : 0) : 1;
        const isSupported = raw.is_supported !== undefined ? (raw.is_supported ? 1 : 0) : 1;

        const exists = checkStmt.get(code);
        if (exists) {
          updated++;
        } else {
          imported++;
        }

        const id = crypto.randomUUID();
        upsertService.run(id, code, sName, dName, icon, cat, isActive, isSupported);
        upsertMapping.run(id, code, dName, cat);
      }

      // Log import
      db.prepare(`
        INSERT INTO grizzly_data_imports (id, import_type, file_name, records_count, status)
        VALUES (?, 'services', ?, ?, 'completed')
      `).run(crypto.randomUUID(), fileName || 'services_import.json', imported + updated);
    });

    tx();
    GrizzlyPartnerProtocolService.invalidateCache();
    return { imported, updated, total: imported + updated };
  }

  /**
   * List Operators
   */
  public static listOperators(countryId?: number): any[] {
    const db = getDatabase();
    if (countryId !== undefined) {
      return db.prepare(`
        SELECT *, provider_operator_code AS operator_code FROM grizzly_operators
        WHERE country_id = ? OR country_id IS NULL
        ORDER BY provider_operator_code ASC
      `).all(countryId);
    }
    return db.prepare('SELECT *, provider_operator_code AS operator_code FROM grizzly_operators ORDER BY provider_operator_code ASC').all();
  }

  /**
   * Add New Operator
   */
  public static addOperator(code: string, name: string, countryId?: number): any {
    const db = getDatabase();
    const cleanCode = code.trim().toLowerCase();
    const cleanName = name.trim();

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO grizzly_operators (id, provider_operator_code, operator_name, country_id, is_active)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(provider_operator_code, country_id) DO UPDATE SET
        operator_name = excluded.operator_name,
        is_active = 1,
        updated_at = datetime('now')
    `).run(id, cleanCode, cleanName, countryId || null);

    return db.prepare('SELECT * FROM grizzly_operators WHERE id = ?').get(id);
  }

  /**
   * List Country-Service Availability Matrix
   */
  public static listCountryServices(params?: {
    countryId?: number;
    serviceCode?: string;
    operator?: string;
    availableOnly?: boolean;
    limit?: number;
    offset?: number;
  }): { total: number; rows: any[] } {
    const db = getDatabase();
    let whereClauses: string[] = ['1=1'];
    const args: any[] = [];

    if (params?.countryId !== undefined) {
      whereClauses.push('cs.provider_country_id = ?');
      args.push(params.countryId);
    }

    if (params?.serviceCode) {
      whereClauses.push('LOWER(cs.provider_service_code) = ?');
      args.push(params.serviceCode.trim().toLowerCase());
    }

    if (params?.operator) {
      whereClauses.push('LOWER(cs.operator_code) = ?');
      args.push(params.operator.trim().toLowerCase());
    }

    if (params?.availableOnly) {
      whereClauses.push('cs.available_quantity > 0 AND cs.is_available = 1');
    }

    const whereStr = whereClauses.join(' AND ');
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM grizzly_country_services cs WHERE ${whereStr}`).get(...args) as any;
    const total = countRow?.total || 0;

    const limit = params?.limit ? Math.min(Math.max(params.limit, 1), 500) : 100;
    const offset = params?.offset ? Math.max(params.offset, 0) : 0;

    const rows = db.prepare(`
      SELECT
        cs.*,
        c.country_name,
        c.flag,
        c.country_code_iso2,
        s.service_name,
        s.display_name,
        s.category
      FROM grizzly_country_services cs
      LEFT JOIN grizzly_countries c ON cs.provider_country_id = c.provider_country_id
      LEFT JOIN grizzly_services s ON cs.provider_service_code = s.provider_service_code
      WHERE ${whereStr}
      ORDER BY cs.available_quantity DESC, c.country_name ASC, s.display_name ASC
      LIMIT ? OFFSET ?
    `).all(...args, limit, offset);

    return { total, rows };
  }

  /**
   * Synchronize country-service availability table with actual live inventory
   */
  public static syncCountryServicesWithLiveInventory(): { syncedPairs: number; totalAvailable: number } {
    const db = getDatabase();
    const config = db.prepare("SELECT protocol_key FROM grizzly_provider_config WHERE id = 'grizzlysms_config'").get() as any;
    const protocolKey = config?.protocol_key || '';

    // Invoke GET_SERVICES calculation logic to determine live quantities
    const resp = GrizzlyPartnerProtocolService.handleGetServices({
      action: 'GET_SERVICES',
      key: protocolKey
    });

    let syncedPairs = 0;
    let totalAvailable = 0;

    const upsertStmt = db.prepare(`
      INSERT INTO grizzly_country_services (
        id, provider_country_id, provider_service_code, operator_code, available_quantity, is_available, is_enabled, last_inventory_sync
      ) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(provider_country_id, provider_service_code, operator_code) DO UPDATE SET
        available_quantity = excluded.available_quantity,
        is_available = excluded.is_available,
        last_inventory_sync = datetime('now'),
        updated_at = datetime('now')
    `);

    const tx = db.transaction(() => {
      // Reset currently marked availability to zero before setting live counts
      db.prepare("UPDATE grizzly_country_services SET available_quantity = 0, is_available = 0, updated_at = datetime('now')").run();

      for (const item of resp.countryList || []) {
        const countryId = item.country;
        for (const [op, svcMap] of Object.entries(item.operatorMap || {})) {
          for (const [svc, count] of Object.entries(svcMap || {})) {
            const qty = Math.max(0, count);
            totalAvailable += qty;
            syncedPairs++;
            upsertStmt.run(crypto.randomUUID(), countryId, svc, op, qty, qty > 0 ? 1 : 0);
          }
        }
      }

      // Log sync event
      db.prepare(`
        INSERT INTO grizzly_data_imports (id, import_type, file_name, records_count, status)
        VALUES (?, 'availability_sync', 'live_inventory_sync', ?, 'completed')
      `).run(crypto.randomUUID(), syncedPairs);
    });

    tx();
    return { syncedPairs, totalAvailable };
  }

  /**
   * Export complete mapping database as JSON
   */
  public static exportMappingData(): any {
    const db = getDatabase();
    const countries = db.prepare('SELECT * FROM grizzly_countries ORDER BY provider_country_id ASC').all();
    const services = db.prepare('SELECT * FROM grizzly_services ORDER BY provider_service_code ASC').all();
    const operators = db.prepare('SELECT * FROM grizzly_operators ORDER BY provider_operator_code ASC').all();
    const countryServices = db.prepare('SELECT * FROM grizzly_country_services WHERE is_available = 1').all();

    return {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      provider: 'grizzlysms',
      counts: {
        countries: countries.length,
        services: services.length,
        operators: operators.length,
        availablePairs: countryServices.length
      },
      countries,
      services,
      operators,
      countryServices
    };
  }

  /**
   * Get Import History
   */
  public static getImportHistory(limit = 50): any[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM grizzly_data_imports
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }
}
