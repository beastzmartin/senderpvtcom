import { getDatabase } from '../db/database.js';
import { initMarginSchema } from '../db/marginSchema.js';
import { MarginService } from '../services/virtualNumber/MarginService.js';

async function runMarginTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING MARGIN ENGINE & PRICING RULES TEST SUITE');
  console.log('====================================================\n');

  const db = getDatabase();
  initMarginSchema(db);
  const marginService = MarginService.getInstance();

  let passed = 0;
  let failed = 0;

  function assert(desc: string, cond: boolean) {
    if (cond) {
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  // Clear existing non-default rules for isolated test run
  db.prepare("DELETE FROM margin_rules WHERE id != 'default_global_margin'").run();

  // Reset default pricing settings
  marginService.updatePricingSettings({
    fx_rate: 1.0,
    min_margin: 2.0,
    min_sell_price: 5.0,
    rounding_mode: '2_decimals',
    display_currency: 'INR'
  });

  console.log('--- Test Group 1: Priority Resolution (5 Levels) ---');
  // 1. Global: 20%
  marginService.updateMarginRule('default_global_margin', {
    type: 'percent',
    percent_value: 20,
    enabled: true
  });

  // Global fallback test
  let res = marginService.calculateSellPrice(10, 'germany', 'telegram', 'any');
  assert('Global rule applied when no specific rule exists (cost 10 + 20% = 12)', res.sellPrice === 12 && res.matchedScope === 'global');

  // 2. Country rule: england + fixed 5
  marginService.createMarginRule({
    scope: 'country',
    country: 'england',
    type: 'fixed',
    fixed_value: 5,
    enabled: true
  });
  res = marginService.calculateSellPrice(10, 'england', 'telegram', 'any');
  assert('Country rule overrides Global rule (england cost 10 + 5 = 15)', res.sellPrice === 15 && res.matchedScope === 'country');

  // 3. Product rule: whatsapp + percent 50%
  marginService.createMarginRule({
    scope: 'product',
    product: 'whatsapp',
    type: 'percent',
    percent_value: 50,
    enabled: true
  });
  res = marginService.calculateSellPrice(10, 'england', 'whatsapp', 'any');
  assert('Product rule overrides Country rule (whatsapp 50% overrides england fixed 5)', res.sellPrice === 15 && res.matchedScope === 'product');

  // 4. Country + Product rule: england + whatsapp + fixed 12
  marginService.createMarginRule({
    scope: 'country_product',
    country: 'england',
    product: 'whatsapp',
    type: 'fixed',
    fixed_value: 12,
    enabled: true
  });
  res = marginService.calculateSellPrice(10, 'england', 'whatsapp', 'any');
  assert('Country+Product rule overrides Product rule (england whatsapp +12 = 22)', res.sellPrice === 22 && res.matchedScope === 'country_product');

  // 5. Country + Product + Operator rule: england + whatsapp + vodafone + percent_plus_fixed (10% + 20)
  marginService.createMarginRule({
    scope: 'country_product_operator',
    country: 'england',
    product: 'whatsapp',
    operator: 'vodafone',
    type: 'percent_plus_fixed',
    percent_value: 10,
    fixed_value: 20,
    enabled: true
  });
  res = marginService.calculateSellPrice(10, 'england', 'whatsapp', 'vodafone');
  // cost 10 * 1.1 + 20 = 31
  assert('Country+Product+Operator rule has highest priority (10 * 1.1 + 20 = 31)', res.sellPrice === 31 && res.matchedScope === 'country_product_operator');

  console.log('\n--- Test Group 2: Floor & Safeguard Constraints ---');
  // Minimum profit floor (min_margin = 2.0)
  // If rule adds 0 profit (fixed 0), min_margin ensures sell >= cost + 2
  marginService.createMarginRule({
    scope: 'product',
    product: 'cheap_app',
    type: 'fixed',
    fixed_value: 0.1,
    enabled: true
  });
  res = marginService.calculateSellPrice(10, 'usa', 'cheap_app');
  assert('Enforces min_margin floor (cost 10 + 0.1 = 10.1 -> boosted to 12.0)', res.sellPrice === 12.0 && res.profit >= 2.0);

  // Minimum sell price floor (min_sell_price = 5.0)
  res = marginService.calculateSellPrice(0.5, 'usa', 'cheap_app');
  // cost 0.5 + min_margin 2.0 = 2.5, but min_sell_price is 5.0 -> 5.0
  assert('Enforces min_sell_price floor (cost 0.5 + 2.0 = 2.5 -> boosted to 5.0)', res.sellPrice === 5.0);

  console.log('\n--- Test Group 3: Rounding Modes & FX Rate ---');
  // FX Rate conversion
  marginService.updatePricingSettings({ fx_rate: 1.25, rounding_mode: 'none' });
  res = marginService.calculateSellPrice(10, 'russia', 'other_app');
  // convertedCost = 10 * 1.25 = 12.5. Global 20% -> 12.5 * 1.2 = 15.0
  assert('Converts cost with FX rate multiplier (10 RUB * 1.25 fx = 12.5 cost, sell = 15)', res.costPrice === 12.5 && res.sellPrice === 15.0);

  // Rounding: 99_cents mode
  marginService.updatePricingSettings({ fx_rate: 1.0, rounding_mode: '99_cents' });
  res = marginService.calculateSellPrice(15.2, 'russia', 'other_app');
  // 15.2 * 1.2 = 18.24 -> 18.99
  assert('Applies .99 style psychological rounding (18.24 -> 18.99)', res.sellPrice === 18.99);

  // Rounding: nearest_1 mode
  marginService.updatePricingSettings({ rounding_mode: 'nearest_1' });
  res = marginService.calculateSellPrice(15.2, 'russia', 'other_app');
  // 18.24 -> 19
  assert('Applies nearest integer rounding (18.24 -> 19)', res.sellPrice === 19);

  console.log('\n--- Test Group 4: Hidden Items Toggle ---');
  marginService.addHiddenItem('country', 'banned_country');
  marginService.addHiddenItem('product', 'banned_service');
  assert('Identifies hidden country correctly', marginService.isItemHidden('country', 'banned_country') === true);
  assert('Identifies non-hidden country correctly', marginService.isItemHidden('country', 'england') === false);
  assert('Identifies hidden product correctly', marginService.isItemHidden('product', 'banned_service') === true);

  // Clean up test rules & restore production defaults
  db.prepare("DELETE FROM margin_rules WHERE id != 'default_global_margin'").run();
  marginService.updateMarginRule('default_global_margin', {
    type: 'percent',
    percent_value: 25,
    enabled: true
  });
  marginService.updatePricingSettings({
    fx_rate: 1.0,
    min_margin: 0.0,
    min_sell_price: 0.0,
    rounding_mode: '2_decimals',
    display_currency: 'INR'
  });
  db.prepare("DELETE FROM hidden_items WHERE value IN ('banned_country', 'banned_service')").run();

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runMarginTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

