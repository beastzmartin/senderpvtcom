import Database from 'better-sqlite3';
import crypto from 'crypto';
import { VIRTUAL_NUMBER_SCHEMA_SQL } from './virtualNumberSchema.js';

export function initVirtualNumberDatabase(db: Database.Database): void {
  try {
    // 1. Create tables
    db.exec(VIRTUAL_NUMBER_SCHEMA_SQL);

    // 2. Seed Default Supported Countries if empty
    const countryCount = (db.prepare('SELECT COUNT(*) as count FROM virtual_number_countries').get() as { count: number }).count;
    if (countryCount === 0) {
      console.log('[Virtual Numbers DB] Seeding initial country registry...');
      const insertCountry = db.prepare(`
        INSERT INTO virtual_number_countries (iso_code, name, dial_code, flag_emoji, continent, is_active, available_numbers_count)
        VALUES (?, ?, ?, ?, ?, 1, 0)
      `);

      const defaultCountries = [
        { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸', continent: 'North America' },
        { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧', continent: 'Europe' },
        { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦', continent: 'North America' },
        { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳', continent: 'Asia' },
        { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺', continent: 'Oceania' },
        { code: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪', continent: 'Europe' },
        { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷', continent: 'Europe' },
        { code: 'NL', name: 'Netherlands', dial: '+31', flag: '🇳🇱', continent: 'Europe' },
        { code: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬', continent: 'Asia' },
        { code: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪', continent: 'Asia' },
        { code: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷', continent: 'South America' },
        { code: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦', continent: 'Africa' }
      ];

      for (const c of defaultCountries) {
        insertCountry.run(c.code, c.name, c.dial, c.flag, c.continent);
      }
    }

    // 3. Seed Standard Virtual Number Products
    const prodCount = (db.prepare('SELECT COUNT(*) as count FROM virtual_number_products').get() as { count: number }).count;
    if (prodCount === 0) {
      console.log('[Virtual Numbers DB] Seeding virtual number products...');
      const insertProd = db.prepare(`
        INSERT INTO virtual_number_products (id, name, slug, category, capabilities, whatsapp_supported, otp_supported, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const defaultProducts = [
        {
          id: 'prod-mobile-sms-voice',
          name: 'Mobile Virtual Number (SMS + Voice)',
          slug: 'mobile-sms-voice',
          category: 'mobile',
          capabilities: JSON.stringify(['sms', 'voice']),
          whatsapp: 1,
          otp: 1,
          desc: 'High-reputation mobile virtual number supporting both two-way SMS and voice calls. WhatsApp compatible.'
        },
        {
          id: 'prod-mobile-sms-only',
          name: 'Mobile Virtual Number (SMS Only)',
          slug: 'mobile-sms-only',
          category: 'mobile',
          capabilities: JSON.stringify(['sms']),
          whatsapp: 0,
          otp: 1,
          desc: 'Cost-effective mobile number specialized for receiving SMS messages and service notifications.'
        },
        {
          id: 'prod-tollfree-voice',
          name: 'Toll-Free Business Number',
          slug: 'tollfree-voice',
          category: 'toll_free',
          capabilities: JSON.stringify(['voice']),
          whatsapp: 0,
          otp: 0,
          desc: 'Commercial 1-800 / national toll-free number for high-volume inbound customer care.'
        },
        {
          id: 'prod-dedicated-enterprise',
          name: 'Dedicated Private Virtual Line',
          slug: 'dedicated-enterprise',
          category: 'dedicated',
          capabilities: JSON.stringify(['sms', 'voice', 'whatsapp']),
          whatsapp: 1,
          otp: 1,
          desc: '100% private, non-shared dedicated telecommunications line with guaranteed long-term renewal.'
        },
        {
          id: 'prod-temp-otp',
          name: 'Temporary Activation Number',
          slug: 'temporary-activation',
          category: 'temporary',
          capabilities: JSON.stringify(['sms']),
          whatsapp: 0,
          otp: 1,
          desc: 'Short-duration virtual number for disposable testing and temporary activations.'
        }
      ];

      for (const p of defaultProducts) {
        insertProd.run(p.id, p.name, p.slug, p.category, p.capabilities, p.whatsapp, p.otp, p.desc);
      }
    }

    // 4. Seed Development / Testing Sandbox Provider
    // NOTE: This mock provider is strictly for local dev & unit tests. Real provider API will be plugged in via documentation in the next phase!
    const provCount = (db.prepare('SELECT COUNT(*) as count FROM virtual_number_providers').get() as { count: number }).count;
    if (provCount === 0) {
      console.log('[Virtual Numbers DB] Seeding Sandbox Provider for Testing...');
      const insertProv = db.prepare(`
        INSERT INTO virtual_number_providers (
          id, name, slug, description, api_base_url, auth_type, encrypted_credentials,
          webhook_secret, priority, status, is_mock, supported_countries, capabilities, health_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, 'healthy')
      `);

      const sandboxProvId = 'provider-sandbox-test';
      insertProv.run(
        sandboxProvId,
        'Global Telecom Gateway (Sandbox Testing)',
        'global-telecom-sandbox',
        'Built-in sandbox provider adapter for internal system testing and UI validation until production API documentation is integrated.',
        'https://sandbox-telecom.local/api/v1',
        'api_key',
        JSON.stringify({ apiKey: 'sandbox_test_key_placeholder' }),
        'whsec_sandbox_test_webhook_secret',
        1,
        JSON.stringify(['US', 'GB', 'CA', 'IN', 'AU', 'DE']),
        JSON.stringify(['sms', 'voice', 'whatsapp'])
      );

      // Seed Default Markup & Pricing Rules for the Sandbox Provider
      const insertPricing = db.prepare(`
        INSERT INTO virtual_number_pricing (
          id, provider_id, country_code, product_id, pricing_model, base_cost,
          activation_fee, markup_amount, markup_percentage, daily_rental_price,
          weekly_rental_price, monthly_rental_price, annual_rental_price, renewal_price,
          sms_inbound_charge, voice_inbound_charge, voice_outbound_charge, tax_percentage, is_active
        ) VALUES (?, ?, ?, ?, 'cost_plus', ?, ?, ?, 15.0, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, 1)
      `);

      insertPricing.run(
        'price-rule-default-us',
        sandboxProvId,
        'US',
        'prod-mobile-sms-voice',
        80.0, // base cost ₹80
        20.0, // activation fee ₹20
        30.0, // fixed markup ₹30
        15.0, // daily ₹15
        45.0, // weekly ₹45
        110.0, // monthly ₹110
        1100.0, // annual ₹1100
        100.0, // renewal ₹100
        0.50, // sms inbound ₹0.50
        1.20, // voice in ₹1.20/min
        2.50  // voice out ₹2.50/min
      );

      insertPricing.run(
        'price-rule-default-gb',
        sandboxProvId,
        'GB',
        'prod-mobile-sms-voice',
        120.0, // base cost ₹120
        25.0,  // activation fee ₹25
        35.0,  // fixed markup ₹35
        25.0,  // daily ₹25
        75.0,  // weekly ₹75
        155.0, // monthly ₹155
        1500.0, // annual ₹1500
        140.0, // renewal ₹140
        0.75, // sms inbound ₹0.75
        1.50, // voice in ₹1.50/min
        3.00  // voice out ₹3.00/min
      );

      insertPricing.run(
        'price-rule-default-ca',
        sandboxProvId,
        'CA',
        'prod-mobile-sms-voice',
        90.0,
        20.0,
        30.0,
        18.0,
        50.0,
        120.0,
        1200.0,
        110.0,
        0.50,
        1.30,
        2.60
      );

      // Seed Initial Sandbox Inventory Numbers
      const insertInv = db.prepare(`
        INSERT INTO virtual_number_inventory (
          id, provider_id, provider_number_ref, phone_number, country_code,
          number_type, capabilities, whatsapp_compatible, otp_compatible,
          provider_base_cost, activation_fee, monthly_price, renewal_price,
          status, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)
      `);

      const initialInventory = [
        {
          num: '+12025550143',
          country: 'US',
          type: 'mobile',
          caps: ['sms', 'voice'],
          wa: 1,
          otp: 1,
          cost: 80,
          act: 20,
          mth: 110,
          ren: 100
        },
        {
          num: '+12025550189',
          country: 'US',
          type: 'mobile',
          caps: ['sms', 'voice'],
          wa: 1,
          otp: 1,
          cost: 80,
          act: 20,
          mth: 110,
          ren: 100
        },
        {
          num: '+18005550199',
          country: 'US',
          type: 'toll_free',
          caps: ['voice'],
          wa: 0,
          otp: 0,
          cost: 150,
          act: 30,
          mth: 199,
          ren: 180
        },
        {
          num: '+447911123456',
          country: 'GB',
          type: 'mobile',
          caps: ['sms', 'voice'],
          wa: 1,
          otp: 1,
          cost: 120,
          act: 25,
          mth: 155,
          ren: 140
        },
        {
          num: '+447911987654',
          country: 'GB',
          type: 'mobile',
          caps: ['sms'],
          wa: 0,
          otp: 1,
          cost: 95,
          act: 20,
          mth: 130,
          ren: 120
        },
        {
          num: '+14165550172',
          country: 'CA',
          type: 'mobile',
          caps: ['sms', 'voice'],
          wa: 1,
          otp: 1,
          cost: 90,
          act: 20,
          mth: 120,
          ren: 110
        },
        {
          num: '+14165550198',
          country: 'CA',
          type: 'mobile',
          caps: ['sms', 'voice'],
          wa: 1,
          otp: 1,
          cost: 90,
          act: 20,
          mth: 120,
          ren: 110
        }
      ];

      for (const item of initialInventory) {
        insertInv.run(
          `inv-${crypto.randomUUID()}`,
          sandboxProvId,
          `ref_${item.num.replace(/\D/g, '')}`,
          item.num,
          item.country,
          item.type,
          JSON.stringify(item.caps),
          item.wa,
          item.otp,
          item.cost,
          item.act,
          item.mth,
          item.ren,
          JSON.stringify({ note: 'Sandbox test number' })
        );
      }

      // Update available inventory count in countries table
      db.prepare(`
        UPDATE virtual_number_countries
        SET available_numbers_count = (
          SELECT COUNT(*) FROM virtual_number_inventory
          WHERE virtual_number_inventory.country_code = virtual_number_countries.iso_code
          AND virtual_number_inventory.status = 'available'
        )
      `).run();

      console.log('[Virtual Numbers DB] Sandbox inventory and pricing successfully initialized.');
    }
  } catch (err) {
    console.error('[Virtual Numbers DB] Initialization error:', err);
  }
}
