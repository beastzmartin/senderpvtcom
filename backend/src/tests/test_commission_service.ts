import { getDatabase } from '../db/database.js';
import { CommissionService } from '../services/CommissionService.js';

console.log('====================================================');
console.log('🧪 RUNNING CUSTOM COMMISSION SETTER TEST SUITE');
console.log('====================================================\n');

const db = getDatabase();
const commissionService = CommissionService.getInstance();

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`, details || '');
    failed++;
  }
}

try {
  // Test 1: Check default rules exist
  console.log('--- Test Group 1: Default Seeded Rules ---');
  const allRules = commissionService.getAllRules();
  assert(allRules.length >= 4, 'Default rules initialized (Universal, Numbers, Reseller, Leads)', { count: allRules.length });

  // Test 2: Calculate universal commission
  console.log('\n--- Test Group 2: Universal Base Commission Calculation ---');
  // Base price 100 with 20% universal commission = 120
  const calc1 = commissionService.resolveCommission('custom_product', 100, undefined, 'user');
  assert(calc1.commission === 20, '100 base price with 20% universal commission yields 20 commission', calc1);
  assert(calc1.sellPrice === 120, 'Sell price equals base 100 + 20 commission = 120', calc1);

  // Test 3: Product-specific commission override
  console.log('\n--- Test Group 3: Product-Specific Commission Resolution ---');
  // Virtual numbers has 25% commission rule
  const calc2 = commissionService.resolveCommission('virtual_numbers', 100, undefined, 'user');
  assert(calc2.commission === 25, 'virtual_numbers gets 25% commission instead of 20% universal', calc2);
  assert(calc2.ruleUsed?.product_type === 'virtual_numbers', 'Identified virtual_numbers rule');

  // Test 4: Role-specific commission override
  console.log('\n--- Test Group 4: Role-Specific (Reseller) Override ---');
  // Resellers get 8% commission on all_products
  const calcReseller = commissionService.resolveCommission('custom_product', 100, undefined, 'reseller');
  assert(calcReseller.commission === 8, 'Reseller role receives preferred 8% commission rate', calcReseller);
  assert(calcReseller.sellPrice === 108, 'Reseller sell price is 108', calcReseller);

  // Test 5: Floor enforcement
  console.log('\n--- Test Group 5: Minimum Commission Floor Enforcement ---');
  // Base price 2 with 20% = 0.40, but min_commission is 1.0
  const calcFloor = commissionService.resolveCommission('custom_product', 2, undefined, 'user');
  assert(calcFloor.commission >= 1.0, `Enforces min commission floor (0.40 boosted to ${calcFloor.commission})`, calcFloor);

  // Test 6: Create, Update, Delete rule
  console.log('\n--- Test Group 6: CRUD Operations ---');
  const created = commissionService.createRule({
    name: 'VIP Special Wholesale 5%',
    product_type: 'all_products',
    target_role: 'vip',
    type: 'percent',
    percent_value: 5.0,
    min_commission: 0.25,
    description: 'Special test VIP tier'
  });
  assert(created.name === 'VIP Special Wholesale 5%', 'Created VIP commission rule');

  const calcVip = commissionService.resolveCommission('all_products', 200, undefined, 'vip');
  assert(calcVip.commission === 10, 'VIP receives 5% commission on 200 = 10', calcVip);

  const updated = commissionService.updateRule(created.id, { percent_value: 6.0 });
  assert(updated.percent_value === 6.0, 'Updated VIP commission rule to 6%');

  const deleted = commissionService.deleteRule(created.id);
  assert(deleted === true, 'Successfully deleted rule');

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
} catch (err) {
  console.error('Fatal test error:', err);
  process.exit(1);
}

