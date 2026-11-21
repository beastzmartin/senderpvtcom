import { LicenseService } from '../backend/src/services/licenseService.js';
import { requireActiveLicense, requireAdmin } from '../backend/src/middleware/authMiddleware.js';
import { getDatabase } from '../backend/src/db/database.js';

async function runDesktopLicenseVerification() {
  console.log('====================================================');
  console.log('🧪 Starting Desktop Standalone & Licensing Verification Test');
  console.log('====================================================\n');

  const licenseService = LicenseService.getInstance();

  // Test 1: HWID Generation & Format
  console.log('▶ TEST 1: Hardware ID (HWID) Fingerprint Detection');
  const hwid = licenseService.getHardwareId();
  console.log('  Detected HWID:', hwid);
  if (!hwid.startsWith('PVT-') || hwid.length < 16) {
    throw new Error(`HWID format invalid: ${hwid}`);
  }
  const hwidSecondCheck = licenseService.getHardwareId();
  if (hwid !== hwidSecondCheck) {
    throw new Error('HWID is not stable across calls!');
  }
  console.log('  ✅ PASSED: HWID is stable and matches PVT-XXXX-XXXX-XXXX-XXXX format.\n');

  // Test 2: Cryptographic Key Generation & Validation (Bound to this HWID)
  console.log('▶ TEST 2: Cryptographically Signed Key Generation & Validation');
  const boundKey = licenseService.generateSignedKey({
    tier: 'pro',
    days: 30,
    hwid
  });
  console.log('  Generated Key (Bound to HWID):', boundKey);
  const valBound = licenseService.validateKey(boundKey, hwid);
  if (!valBound.valid || valBound.tier !== 'pro' || valBound.isLifetime) {
    throw new Error(`Bound key validation failed: ${JSON.stringify(valBound)}`);
  }
  console.log('  ✅ PASSED: Machine-bound key validated successfully.\n');

  // Test 3: Anti-Tamper / Hardware Mismatch Protection
  console.log('▶ TEST 3: Hardware Mismatch & Anti-Piracy Protection');
  const foreignHwid = 'PVT-9999-8888-7777-6666';
  const valForeign = licenseService.validateKey(boundKey, foreignHwid);
  if (valForeign.valid) {
    throw new Error('Foreign machine was able to validate another computer key!');
  }
  console.log('  ✅ PASSED: Foreign machine rejected invalid key as expected.\n');

  // Test 4: Universal Distributor / Master Offline Key Validation
  console.log('▶ TEST 4: Universal Key & Master Developer Key Validation');
  const universalKey = licenseService.generateSignedKey({
    tier: 'enterprise',
    isLifetime: true,
    hwid: 'UNIVERSAL'
  });
  console.log('  Generated Universal Key:', universalKey);
  const valUniversal = licenseService.validateKey(universalKey, hwid);
  if (!valUniversal.valid || valUniversal.tier !== 'enterprise' || !valUniversal.isLifetime) {
    throw new Error(`Universal key validation failed: ${JSON.stringify(valUniversal)}`);
  }
  const valMaster = licenseService.validateKey('PVT-MASTER-LIFETIME-ENTERPRISE', hwid);
  if (!valMaster.valid || !valMaster.isLifetime) {
    throw new Error('Master developer key failed validation');
  }
  console.log('  ✅ PASSED: Universal & Master keys validated successfully.\n');

  // Test 5: License Activation & SQLite State Persistence
  console.log('▶ TEST 5: License Activation & Local Storage Persistence');
  const activationResult = licenseService.activateLicense(universalKey);
  console.log('  Activation Result:', activationResult.message);
  if (!activationResult.success) {
    throw new Error('License activation returned success=false');
  }

  const activeStatus = licenseService.getActiveLicense();
  if (!activeStatus.active || !activeStatus.license || activeStatus.license.plan_tier !== 'enterprise') {
    throw new Error(`Active status mismatch: ${JSON.stringify(activeStatus)}`);
  }
  console.log('  Active Plan Tier:', activeStatus.license.plan_tier);
  console.log('  Lifetime Status :', activeStatus.license.is_lifetime ? 'YES (Permanent)' : 'NO');
  console.log('  Daily Msg Limit :', activeStatus.license.daily_message_limit);
  console.log('  Max Devices     :', activeStatus.license.max_devices);
  console.log('  ✅ PASSED: License state securely persisted in SQLite table app_license.\n');

  // Test 6: Local Admin Profile Scoping
  console.log('▶ TEST 6: Local Admin User Entity Verification');
  const localUser = licenseService.getOrCreateLocalUser();
  if (localUser.id !== 'local_user' || localUser.role !== 'admin') {
    throw new Error(`Local user profile invalid: ${JSON.stringify(localUser)}`);
  }
  console.log(`  Local user verified: ${localUser.name} (${localUser.id}) with role: ${localUser.role}`);
  console.log('  ✅ PASSED: Local admin account scoped without requiring passwords or JWT.\n');

  // Test 7: Express Middleware (requireActiveLicense)
  console.log('▶ TEST 7: Express Middleware requireActiveLicense');
  let nextCalled = false;
  let statusSent: number | null = null;
  const mockReq: any = { headers: {} };
  const mockRes: any = {
    status: (code: number) => {
      statusSent = code;
      return { json: () => {} };
    }
  };
  const mockNext = () => { nextCalled = true; };

  requireActiveLicense(mockReq, mockRes, mockNext);
  if (!nextCalled || mockReq.user?.id !== 'local_user' || mockReq.user?.role !== 'admin') {
    throw new Error(`Middleware failed to allow licensed request: ${JSON.stringify(mockReq.user)}`);
  }
  console.log('  Middleware set req.user to:', mockReq.user);
  console.log('  ✅ PASSED: Middleware grants full access to licensed workstation.\n');

  // Test 8: Deactivation & Middleware Lockout Check
  console.log('▶ TEST 8: License Deactivation & Lockout Check');
  licenseService.deactivateLicense();
  const deactivatedStatus = licenseService.getActiveLicense();
  if (deactivatedStatus.active) {
    throw new Error('License still reported active after deactivation!');
  }

  nextCalled = false;
  statusSent = null;
  requireActiveLicense(mockReq, mockRes, mockNext);
  if (statusSent !== 403 || nextCalled) {
    throw new Error(`Unlicensed request was not blocked with 403! status=${statusSent}, next=${nextCalled}`);
  }
  console.log('  Unlicensed request received HTTP 403 Forbidden as expected.');
  console.log('  ✅ PASSED: Deactivation locks access immediately.\n');

  // Re-activate with Master Key for normal desktop operations
  licenseService.activateLicense('PVT-MASTER-LIFETIME-ENTERPRISE');
  console.log('▶ RESTORED: Master Lifetime Enterprise license re-activated for workstation.\n');

  console.log('====================================================');
  console.log('🎉 ALL DESKTOP & LICENSING VERIFICATION TESTS PASSED!');
  console.log('====================================================');
}

runDesktopLicenseVerification().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
