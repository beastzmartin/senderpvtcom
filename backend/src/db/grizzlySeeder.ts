import Database from 'better-sqlite3';
import crypto from 'crypto';
import {
  GRIZZLY_OFFICIAL_COUNTRIES,
  GRIZZLY_OFFICIAL_SERVICES,
  GRIZZLY_OFFICIAL_OPERATORS
} from './grizzlyOfficialData.js';

export function seedGrizzlyData(db: Database.Database): void {
  // 1. Ensure GrizzlySMS exists in main virtual_number_providers table
  const existingProvider = db.prepare("SELECT id FROM virtual_number_providers WHERE slug = 'grizzlysms'").get();
  if (!existingProvider) {
    db.prepare(`
      INSERT INTO virtual_number_providers (
        id, name, slug, description, api_base_url, auth_type, priority, status, is_mock, supported_countries, capabilities
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'grizzlysms',
      'GrizzlySMS',
      'grizzlysms',
      'Partner SMS Number Supplier via GrizzlySMS Partner Protocol (Inbound Allocation)',
      '/api/virtual-numbers/partners/grizzlysms',
      'custom',
      10,
      'active',
      0,
      JSON.stringify(['US', 'RU', 'IN', 'GB', 'DE', 'CA', 'FR', 'NL', 'BR', 'SG', 'ID', 'PH']),
      JSON.stringify(['sms', 'partner_api', 'flashcall'])
    );
    console.log('[DB] Seeded GrizzlySMS provider record in virtual_number_providers.');
  }

  // 2. Ensure grizzly_provider_config exists
  const existingConfig = db.prepare("SELECT id FROM grizzly_provider_config WHERE id = 'grizzlysms_config'").get();
  if (!existingConfig) {
    const defaultProtocolKey = 'grizzly_partner_proto_key_prod_2026';
    db.prepare(`
      INSERT INTO grizzly_provider_config (
        id, provider_id, name, slug, protocol_key, status, partner_api_endpoint,
        priority, max_active_numbers, min_payout, max_payout, ip_allowlist
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'grizzlysms_config',
      'grizzlysms',
      'GrizzlySMS',
      'grizzlysms',
      defaultProtocolKey,
      'enabled',
      '/api/virtual-numbers/partners/grizzlysms',
      10,
      250,
      0.0,
      500.0,
      JSON.stringify([])
    );
    console.log('[DB] Seeded GrizzlySMS provider configuration.');
  }

  // 3. Seed Official Grizzly Countries Database
  const upsertCountry = db.prepare(`
    INSERT INTO grizzly_countries (
      id, provider_country_id, country_name, country_code_iso2, country_code_iso3, flag, dial_code, is_active, is_supported
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
    ON CONFLICT(provider_country_id) DO UPDATE SET
      country_name = excluded.country_name,
      country_code_iso2 = excluded.country_code_iso2,
      country_code_iso3 = excluded.country_code_iso3,
      flag = excluded.flag,
      dial_code = excluded.dial_code
  `);

  const insertCountryMapping = db.prepare(`
    INSERT INTO grizzly_country_mappings (id, grizzly_country_id, iso_code, country_name, dial_code, flag_emoji, is_enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(grizzly_country_id) DO NOTHING
  `);

  for (const c of GRIZZLY_OFFICIAL_COUNTRIES) {
    const cid = crypto.randomUUID();
    upsertCountry.run(
      cid,
      c.provider_country_id,
      c.country_name,
      c.country_code_iso2,
      c.country_code_iso3,
      c.flag,
      c.dial_code
    );
    insertCountryMapping.run(
      cid,
      c.provider_country_id,
      c.country_code_iso2,
      c.country_name,
      c.dial_code,
      c.flag
    );
  }
  console.log(`[DB] Seeded ${GRIZZLY_OFFICIAL_COUNTRIES.length} official countries into grizzly_countries.`);

  // 4. Seed Official Grizzly Service Registry
  const upsertService = db.prepare(`
    INSERT INTO grizzly_services (
      id, provider_service_code, service_name, display_name, icon, category, is_active, is_supported
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    ON CONFLICT(provider_service_code) DO UPDATE SET
      service_name = excluded.service_name,
      display_name = excluded.display_name,
      icon = excluded.icon,
      category = excluded.category
  `);

  const insertServiceMapping = db.prepare(`
    INSERT INTO grizzly_service_mappings (id, service_code, name, category, is_enabled)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(service_code) DO NOTHING
  `);

  for (const s of GRIZZLY_OFFICIAL_SERVICES) {
    const sid = crypto.randomUUID();
    upsertService.run(
      sid,
      s.provider_service_code,
      s.service_name,
      s.display_name,
      s.icon || 'Send',
      s.category || 'general'
    );
    insertServiceMapping.run(
      sid,
      s.provider_service_code,
      s.display_name,
      s.category || 'general'
    );
  }
  console.log(`[DB] Seeded ${GRIZZLY_OFFICIAL_SERVICES.length} official services into grizzly_services.`);

  // 5. Seed Operators (Default "any")
  const checkOp = db.prepare("SELECT id FROM grizzly_operators WHERE provider_operator_code = 'any' AND country_id IS NULL").get();
  if (!checkOp) {
    db.prepare(`
      INSERT INTO grizzly_operators (id, provider_operator_code, operator_name, is_active)
      VALUES (?, ?, ?, 1)
    `).run('op_any_global', 'any', 'Any Operator (Default)');
    console.log('[DB] Seeded default "any" operator into grizzly_operators.');
  }

  // 5. Seed Initial Hardware Modules & Inventory for testing GET_SERVICES & GET_NUMBER
  const hwCount = (db.prepare('SELECT COUNT(*) as c FROM grizzly_hardware_modules').get() as { c: number }).c;
  if (hwCount === 0) {
    const insertHw = db.prepare(`
      INSERT INTO grizzly_hardware_modules (
        id, slot_number, name, sim_iccid, phone_number, country_id, operator, supported_services, status, max_concurrent_channels
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertInv = db.prepare(`
      INSERT INTO grizzly_inventory (
        id, phone_number, country_id, operator, hardware_module_id, status, supported_services,
        can_get_another_sms, flashcall_supported, voice_supported, cost_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const sampleSims = [
      {
        slot: 1,
        name: 'SIM Module Alpha #1',
        phone: '19157891133',
        countryId: 12,
        operator: 'any',
        services: ['tg', 'wa', 'go', 'ig', 'fb'],
        cost: 15.0
      },
      {
        slot: 2,
        name: 'SIM Module Alpha #2',
        phone: '19157891134',
        countryId: 12,
        operator: 'any',
        services: ['tg', 'wa', 'go'],
        cost: 18.0
      },
      {
        slot: 3,
        name: 'SIM Module Alpha #3',
        phone: '19157891135',
        countryId: 12,
        operator: 'any',
        services: ['tg', 'wa'],
        cost: 20.0
      },
      {
        slot: 4,
        name: 'SIM Module Bravo #1',
        phone: '19157891140',
        countryId: 12,
        operator: 'any',
        services: ['tg', 'wa', 'go', 'ig', 'vi'],
        cost: 16.5
      },
      {
        slot: 5,
        name: 'SIM Module India #1',
        phone: '919876543210',
        countryId: 22,
        operator: 'any',
        services: ['tg', 'wa', 'go'],
        cost: 12.0
      }
    ];

    for (const sim of sampleSims) {
      const hwId = crypto.randomUUID();
      insertHw.run(
        hwId,
        sim.slot,
        sim.name,
        `8901410321${sim.slot}982341`,
        sim.phone,
        sim.countryId,
        sim.operator,
        JSON.stringify(sim.services),
        'active',
        1
      );

      const invId = crypto.randomUUID();
      insertInv.run(
        invId,
        sim.phone,
        sim.countryId,
        sim.operator,
        hwId,
        'available',
        JSON.stringify(sim.services),
        1,
        1,
        0,
        sim.cost
      );
    }

    console.log('[DB] Seeded 5 active hardware modules and available inventory for GrizzlySMS.');
  }
}

