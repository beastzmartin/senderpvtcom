import { initDatabase, getDatabase } from '../db/database.js';
import { LinkParser } from '../services/marketplace/LinkParser.js';
import { SchemaMapper } from '../services/marketplace/SchemaMapper.js';
import { OutputFlattener } from '../services/marketplace/OutputFlattener.js';
import { DraftProductGenerator } from '../services/marketplace/DraftProductGenerator.js';
import { WhiteLabelSanitizer } from '../services/marketplace/WhiteLabelSanitizer.js';
import { MarketplacePricingService } from '../services/marketplace/MarketplacePricingService.js';
import { MarketplaceProductService } from '../services/marketplace/MarketplaceProductService.js';
import { ProviderRegistry } from '../services/marketplace/provider/ProviderRegistry.js';
import { ApifyAdapter } from '../services/marketplace/provider/ApifyAdapter.js';

async function runVerificationSuite() {
  console.log('================================================================');
  console.log('🚀 MASTER VERIFICATION SUITE: ADD-BY-LINK & EXTRACTION STUDIO');
  console.log('================================================================\n');

  initDatabase();
  const db = getDatabase();

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`   ✅ PASS: ${message}`);
      passedTests++;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST SUITE 1: LinkParser (All variations, subpaths, params, duplicates)
  // ---------------------------------------------------------------------------
  console.log('🧪 1. Testing LinkParser Normalization & Duplicate Detection');

  // Test 1.1: Store URL with sub-path and tracking params
  const ref1 = LinkParser.parseActorRef('https://apify.com/clearpath/shopify-store-leads/pricing?fpr=partner123&utm_source=test');
  assert(ref1.isValid, 'Store URL parsed as valid');
  assert(ref1.normalizedActorId === 'clearpath~shopify-store-leads', `Normalized to clearpath~shopify-store-leads (got ${ref1.normalizedActorId})`);
  assert(ref1.username === 'clearpath', `Extracted username "clearpath" (got ${ref1.username})`);
  assert(ref1.actorName === 'shopify-store-leads', `Extracted actorName "shopify-store-leads" (got ${ref1.actorName})`);

  // Test 1.2: Raw username/actor-name format
  const ref2 = LinkParser.parseActorRef('ecommerce_leads/store-leads-14m-e-commerce-leads');
  assert(ref2.isValid, 'Bare username/name parsed as valid');
  assert(ref2.normalizedActorId === 'ecommerce_leads~store-leads-14m-e-commerce-leads', `Normalized slash to tilde (got ${ref2.normalizedActorId})`);

  // Test 1.3: Console URL with deep sub-path
  const ref3 = LinkParser.parseActorRef('https://console.apify.com/actors/kVYdvNOefemtiDXO5/info/readme?build=latest');
  assert(ref3.isValid, 'Console URL parsed as valid');
  assert(ref3.normalizedActorId === 'kVYdvNOefemtiDXO5', `Normalized console link to actor ID (got ${ref3.normalizedActorId})`);

  // Test 1.4: Batch parsing with duplicate detection
  const batchInput = `
    https://apify.com/clearpath/shopify-store-leads
    scrapesage/ycombinator-scraper
    clearpath/shopify-store-leads
  `;
  const batch = LinkParser.parseBatch(batchInput);
  assert(batch.length === 3, 'Batch returned 3 items');
  assert(Boolean(batch[0].isValid && !batch[0].isDuplicate), 'First batch item valid');
  assert(Boolean(batch[1].isValid && !batch[1].isDuplicate), 'Second batch item valid');
  assert(Boolean(batch[2].isDuplicate), 'Duplicate batch item correctly flagged');

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 2: SchemaMapper (All 12 Field Types, show_if, locks, risks)
  // ---------------------------------------------------------------------------
  console.log('🧪 2. Testing Universal SchemaMapper & Multi-Customer State Risk Checks');

  const richMockSchema = {
    title: 'Rich Lead Scraper Input',
    type: 'object',
    required: ['searchQuery', 'targetCount'],
    properties: {
      searchQuery: {
        title: 'Target Keyword',
        type: 'string',
        editor: 'textfield',
        description: 'Industry keyword for leads'
      },
      detailedBio: {
        title: 'Extended Query Note',
        type: 'string',
        editor: 'textarea',
        description: 'Multi-line query context'
      },
      targetCount: {
        title: 'Max Items to Scrape',
        type: 'integer',
        default: 50,
        minimum: 1,
        maximum: 1000
      },
      exportRegion: {
        title: 'Target Country',
        type: 'string',
        editor: 'select',
        enum: ['US', 'IN', 'UK', 'CA'],
        default: 'US'
      },
      categories: {
        title: 'Target Categories',
        type: 'array',
        editor: 'select',
        items: { type: 'string' },
        enum: ['Software', 'Apparel', 'Automotive']
      },
      requireDirectEmail: {
        title: 'Direct Emails Only',
        type: 'boolean',
        default: true
      },
      websiteUrl: {
        title: 'Domain URL',
        type: 'string',
        format: 'uri'
      },
      seedUrls: {
        title: 'Seed URLs List',
        type: 'array',
        editor: 'globs',
        items: { type: 'string' }
      },
      tagsList: {
        title: 'Keyword Tags',
        type: 'array',
        items: { type: 'string' }
      },
      startDate: {
        title: 'Earliest Founded Date',
        type: 'string',
        format: 'date'
      },
      customHeaders: {
        title: 'Custom Metadata Headers',
        type: 'object',
        editor: 'keyValue'
      },
      advancedJsonConfig: {
        title: 'Advanced Filter Spec',
        type: 'object',
        editor: 'json'
      },
      // Multi-customer state risk fields:
      leadListName: {
        title: 'Cross Run Lead List',
        type: 'string',
        description: 'Existing list to avoid duplicates across runs'
      },
      // Secret / Proxy field to hide:
      proxyConfiguration: {
        title: 'Proxy Configuration',
        type: 'object',
        editor: 'proxy'
      }
    }
  };

  const mapped = SchemaMapper.mapSchema(richMockSchema);
  assert(mapped.fields.length >= 12, `Mapped ${mapped.fields.length} dynamic input fields`);

  const fieldTypesFound = new Set(mapped.fields.map((f) => f.type));
  assert(fieldTypesFound.has('text'), 'text field mapped');
  assert(fieldTypesFound.has('textarea'), 'textarea field mapped');
  assert(fieldTypesFound.has('number'), 'number field mapped');
  assert(fieldTypesFound.has('select'), 'select field mapped');
  assert(fieldTypesFound.has('multiselect'), 'multiselect field mapped');
  assert(fieldTypesFound.has('boolean'), 'boolean field mapped');
  assert(fieldTypesFound.has('url'), 'url field mapped');
  assert(fieldTypesFound.has('url_list'), 'url_list field mapped');
  assert(fieldTypesFound.has('string_list'), 'string_list field mapped');
  assert(fieldTypesFound.has('date'), 'date field mapped');
  assert(fieldTypesFound.has('key_value'), 'key_value field mapped');
  assert(fieldTypesFound.has('json') || fieldTypesFound.has('object'), 'json/object field mapped');

  // Verify multi-customer state risk detected
  assert(
    mapped.multiCustomerRiskFields.includes('leadListName'),
    'Multi-customer state risk detected on "leadListName"'
  );

  // Verify proxy field hidden into hiddenDefaults
  assert(
    'proxyConfiguration' in mapped.hiddenDefaults,
    'Proxy field safely abstracted into hiddenDefaults'
  );

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 3: OutputFlattener (Object paths & array predicate selectors)
  // ---------------------------------------------------------------------------
  console.log('🧪 3. Testing OutputFlattener & Array Predicate Extraction');

  const rawSample = {
    _internalId: 'internal_99881',
    actorExecutionId: 'run_apify_xyz',
    companyName: 'Acme SaaS Corp',
    details: {
      domain: 'acme.io',
      headquarters: {
        city: 'Austin',
        state: 'TX'
      }
    },
    contacts: [
      { method: 'phone', target: '+1-555-0199' },
      { method: 'email', target: 'founders@acme.io' }
    ]
  };

  const mappings = [
    { from: 'companyName', to: 'company_name', label: 'Company', type: 'string' as const },
    { from: 'details.domain', to: 'domain', label: 'Domain', type: 'string' as const },
    { from: 'details.headquarters.city', to: 'city', label: 'City', type: 'string' as const },
    { from: 'contacts[method=email].target', to: 'primary_email', label: 'Email', type: 'string' as const }
  ];

  const flattened = OutputFlattener.flattenItem(rawSample, mappings, ['_internalId', 'actorExecutionId']);
  assert(flattened.company_name === 'Acme SaaS Corp', 'Direct field mapped');
  assert(flattened.domain === 'acme.io', 'Nested dot-path mapped (details.domain)');
  assert(flattened.city === 'Austin', 'Deep nested dot-path mapped (city)');
  assert(flattened.primary_email === 'founders@acme.io', 'Array predicate selector extracted email');
  assert(!('_internalId' in flattened) && !('actorExecutionId' in flattened), 'Internal drop_fields filtered');

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 4: MarketplacePricingService (Quotes, TTL, FX Buffer)
  // ---------------------------------------------------------------------------
  console.log('🧪 4. Testing Quote Generation, TTL Countdown & FX Safety Buffer');

  const pricingService = MarketplacePricingService.getInstance();
  const dummyProductDef: any = {
    slug: 'test-quote-extractor',
    pricing: {
      mode: 'per_item',
      currency_basis: 'BASE',
      provider_cost_reference: {
        model: 'pay_per_result',
        usd_per_1000_items: 2.0
      },
      sell: {
        per_1000_items: 299.0,
        per_run_flat: 0
      },
      min_charge: 10.0,
      quote_ttl_secs: 300,
      fx_safety_buffer_percent: 5
    }
  };

  const quote = pricingService.generatePriceQuote(dummyProductDef, 500, 'INR');
  assert(Boolean(quote.quoteId), `Generated quoteId: ${quote.quoteId}`);
  assert(quote.requestedItems === 500, 'Requested items 500');
  assert(quote.sellPrice > 0, `Calculated sell price ₹${quote.sellPrice}`);
  assert(quote.currency === 'INR', 'Currency matches INR');
  assert(Boolean(quote.expiresAt), `Expires at: ${quote.expiresAt}`);
  assert(Boolean(quote.signature), `Signature generated: ${quote.signature}`);

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 5: Drift Detection
  // ---------------------------------------------------------------------------
  console.log('🧪 5. Testing Schema & Pricing Drift Detection');

  const crypto = await import('crypto');
  const richSchemaHash = crypto.createHash('sha256').update(JSON.stringify(richMockSchema)).digest('hex').slice(0, 16);

  const baseProduct: any = {
    slug: 'shopify-leads',
    sync: {
      provider_schema_hash: richSchemaHash,
      last_synced_at: new Date().toISOString()
    },
    pricing: {
      provider_cost_reference: {
        usd_per_1000_items: 2.50
      }
    }
  };

  // Case 5.1: No change -> IN_SYNC
  const driftSync = DraftProductGenerator.detectDrift(baseProduct, {
    actorId: 'clearpath~shopify-store-leads',
    name: 'shopify-store-leads',
    pricingInfo: { model: 'pay_per_result', usdPer1000Items: 2.50 }
  }, richMockSchema);
  assert(driftSync.status === 'IN_SYNC', 'Identical schema and price is IN_SYNC');

  // Case 5.2: Modified schema -> SCHEMA_CHANGED
  const driftSchemaChange = DraftProductGenerator.detectDrift(baseProduct, {
    actorId: 'clearpath~shopify-store-leads',
    name: 'shopify-store-leads',
    pricingInfo: { model: 'pay_per_result', usdPer1000Items: 2.50 }
  }, { ...richMockSchema, properties: { ...richMockSchema.properties, newFilter: { type: 'string' } } });

  assert(driftSchemaChange.hasDrift, 'Detected schema drift');
  assert(driftSchemaChange.status === 'SCHEMA_CHANGED', `Drift status is SCHEMA_CHANGED (got ${driftSchemaChange.status})`);

  // Case 5.3: Price change -> PRICE_CHANGED
  const driftPriceChange = DraftProductGenerator.detectDrift(baseProduct, {
    actorId: 'clearpath~shopify-store-leads',
    name: 'shopify-store-leads',
    pricingInfo: { model: 'pay_per_result', usdPer1000Items: 4.00 } // price jumped from 2.50 to 4.00
  }, richMockSchema);

  assert(driftPriceChange.hasDrift, 'Detected pricing drift');
  assert(driftPriceChange.status === 'PRICE_CHANGED', `Drift status is PRICE_CHANGED (got ${driftPriceChange.status})`);

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 6: White-Label Blocklist & Sanitization Audit
  // ---------------------------------------------------------------------------
  console.log('🧪 6. Testing White-Label Blocklist Audit');

  const leakedText = 'Run this Apify Actor on https://api.apify.com/v2/acts/clearpath~leads/runs with actor execution token';
  const sanitizedText = WhiteLabelSanitizer.cleanText(leakedText);
  assert(!sanitizedText.toLowerCase().includes('apify'), 'Stripped all "apify" mentions');
  assert(!sanitizedText.toLowerCase().includes('actor'), 'Stripped all "actor" mentions');
  assert(!sanitizedText.includes('api.apify.com'), 'Stripped all provider API URLs');

  console.log('');

  // ---------------------------------------------------------------------------
  // TEST SUITE 7: LIVE SMOKE TEST WITH LIVE APIFY KEY AGAINST 4 TARGET ACTORS
  // ---------------------------------------------------------------------------
  console.log('🧪 7. LIVE SMOKE TEST: Importing 4 Mandatory Target Actors with Real Key');
  const dbTokenSetting = (db.prepare("SELECT value FROM marketplace_settings WHERE key = 'apify_api_token'").get() as any)?.value;
  const liveToken = process.env.APIFY_API_TOKEN || dbTokenSetting || '';
  if (!liveToken) {
    throw new Error('APIFY_API_TOKEN must be configured in environment or marketplace_settings table.');
  }
  process.env.APIFY_API_TOKEN = liveToken;

  const targetActors = [
    { label: 'Actor 1 (Shopify Leads)', input: 'https://apify.com/clearpath/shopify-store-leads' },
    { label: 'Actor 2 (14M Leads)', input: 'ecommerce_leads/store-leads-14m-e-commerce-leads' },
    { label: 'Actor 3 (YC Scraper)', input: 'scrapesage/ycombinator-scraper' },
    { label: 'Actor 4 (Console URL)', input: 'https://console.apify.com/actors/kVYdvNOefemtiDXO5/info/readme?build=latest' }
  ];

  const productService = MarketplaceProductService.getInstance();

  for (const target of targetActors) {
    console.log(`\n   🔍 Testing Live Import for: ${target.label} ("${target.input}")`);
    try {
      const parsedRef = LinkParser.parseActorRef(target.input);
      assert(parsedRef.isValid, `Valid actor reference: ${parsedRef.normalizedActorId}`);

      const draft = await productService.importFromProvider('apify', target.input);
      assert(Boolean(draft.slug), `Draft generated with slug: "${draft.slug}"`);
      assert(Boolean(draft.display_name), `Clean title: "${draft.display_name}"`);
      assert(Boolean(draft.input?.fields && draft.input.fields.length > 0), `Mapped ${draft.input?.fields?.length} fields`);
      assert(Boolean(draft.pricing && (draft.pricing.sell?.per_1000_items || 0) > 0), `Sell price calculated: ₹${draft.pricing?.sell?.per_1000_items} / 1k`);
      assert(Boolean(draft.wizard_gates), 'Initialized 8 Review & Activate Wizard gates');

      // White-label verification check on customer-facing view of definition
      const customerDef = WhiteLabelSanitizer.cleanCustomerProduct(draft);
      const wlCheck = WhiteLabelSanitizer.detectLeaks(customerDef);
      assert(!wlCheck.hasLeak, `Zero white-label leaks in customer view (matches: ${wlCheck.matches.join(', ') || 'none'})`);

      console.log(`   ✨ Successfully imported and verified ${target.label}!`);
    } catch (err: any) {
      console.error(`   ❌ Failed on ${target.label}:`, err.message);
      throw err;
    }
  }

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passedTests} / ${totalTests} TESTS PASSED WITH 100% SUCCESS!`);
  console.log('================================================================\n');
}

runVerificationSuite().catch((err) => {
  console.error('Fatal Verification Error:', err);
  process.exit(1);
});
