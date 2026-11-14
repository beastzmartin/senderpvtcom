import Database from 'better-sqlite3';
import crypto from 'crypto';

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
      JSON.stringify(['US', 'RU', 'IN', 'GB', 'DE', 'CA', 'FR', 'NL', 'BR']),
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

  // 3. Seed Country Mappings (Numeric Grizzly ID <-> Country Code)
  const countryMappings = [
    { id: 12, iso: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
    { id: 0, iso: 'RU', name: 'Russia', dial: '+7', flag: '🇷🇺' },
    { id: 22, iso: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
    { id: 16, iso: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
    { id: 36, iso: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
    { id: 43, iso: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
    { id: 78, iso: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
    { id: 48, iso: 'NL', name: 'Netherlands', dial: '+31', flag: '🇳🇱' },
    { id: 73, iso: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷' },
    { id: 187, iso: 'US', name: 'United States (Alt)', dial: '+1', flag: '🇺🇸' }
  ];

  const checkCountry = db.prepare('SELECT id FROM grizzly_country_mappings WHERE grizzly_country_id = ?');
  const insertCountry = db.prepare(`
    INSERT INTO grizzly_country_mappings (id, grizzly_country_id, iso_code, country_name, dial_code, flag_emoji, is_enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  for (const c of countryMappings) {
    if (!checkCountry.get(c.id)) {
      insertCountry.run(crypto.randomUUID(), c.id, c.iso, c.name, c.dial, c.flag);
    }
  }

  // 4. Seed Service Mappings
  const serviceMappings = [
    { code: 'tg', name: 'Telegram', category: 'social' },
    { code: 'wa', name: 'WhatsApp', category: 'social' },
    { code: 'go', name: 'Google / YouTube', category: 'technology' },
    { code: 'ig', name: 'Instagram', category: 'social' },
    { code: 'vi', name: 'Viber', category: 'social' },
    { code: 'fb', name: 'Facebook', category: 'social' },
    { code: 'tw', name: 'Twitter / X', category: 'social' },
    { code: 'wb', name: 'WeChat', category: 'social' },
    { code: 'ot', name: 'Other Services', category: 'general' }
  ];

  const checkService = db.prepare('SELECT id FROM grizzly_service_mappings WHERE service_code = ?');
  const insertService = db.prepare(`
    INSERT INTO grizzly_service_mappings (id, service_code, name, category, is_enabled)
    VALUES (?, ?, ?, ?, 1)
  `);

  for (const s of serviceMappings) {
    if (!checkService.get(s.code)) {
      insertService.run(crypto.randomUUID(), s.code, s.name, s.category);
    }
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
