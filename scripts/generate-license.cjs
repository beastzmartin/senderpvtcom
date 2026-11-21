#!/usr/bin/env node

/**
 * WhatsApp Desktop Suite - License Key Generator CLI
 * 
 * Usage:
 *   node scripts/generate-license.cjs --tier enterprise --lifetime
 *   node scripts/generate-license.cjs --tier pro --days 365 --hwid PVT-XXXX-XXXX-XXXX-XXXX
 *   node scripts/generate-license.cjs --tier starter --days 30
 */

const crypto = require('crypto');

const LICENSE_SECRET = process.env.LICENSE_SECRET || 'PVT_SECURE_HMAC_SALT_KEY_WHATSAPP_DESKTOP_2026';

function computeSignature(payload) {
  return crypto.createHmac('sha256', LICENSE_SECRET).update(payload).digest('hex').substring(0, 16).toUpperCase();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tier: 'enterprise',
    days: 365,
    isLifetime: false,
    hwid: 'UNIVERSAL',
    maxDevices: null,
    dailyMsgLimit: null,
    dailyExtLimit: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--tier' && args[i + 1]) {
      options.tier = args[++i].toLowerCase();
    } else if (arg === '--days' && args[i + 1]) {
      options.days = parseInt(args[++i], 10);
    } else if (arg === '--lifetime') {
      options.isLifetime = true;
    } else if (arg === '--hwid' && args[i + 1]) {
      options.hwid = args[++i].toUpperCase();
    } else if (arg === '--devices' && args[i + 1]) {
      options.maxDevices = parseInt(args[++i], 10);
    } else if (arg === '--msg-limit' && args[i + 1]) {
      options.dailyMsgLimit = parseInt(args[++i], 10);
    } else if (arg === '--ext-limit' && args[i + 1]) {
      options.dailyExtLimit = parseInt(args[++i], 10);
    }
  }

  return options;
}

function generateKey(opts) {
  const tier = (opts.tier || 'pro').toUpperCase();
  const hwidTarget = opts.hwid ? opts.hwid.trim().toUpperCase() : 'UNIVERSAL';
  let expiryStr;

  if (opts.isLifetime || !opts.days || opts.days >= 9999) {
    expiryStr = 'LIFETIME';
  } else {
    const expDate = new Date(Date.now() + opts.days * 24 * 3600 * 1000);
    const yyyy = expDate.getUTCFullYear();
    const mm = String(expDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(expDate.getUTCDate()).padStart(2, '0');
    expiryStr = `${yyyy}${mm}${dd}`;
  }

  const maxDev = opts.maxDevices || (tier === 'ENTERPRISE' ? 10 : tier === 'PRO' ? 5 : 2);
  const msgLim = opts.dailyMsgLimit || (tier === 'ENTERPRISE' ? 20000 : tier === 'PRO' ? 5000 : 1000);
  const extLim = opts.dailyExtLimit || (tier === 'ENTERPRISE' ? 20000 : tier === 'PRO' ? 5000 : 1000);

  const payload = `${hwidTarget}:${tier}:${expiryStr}:${maxDev}:${msgLim}:${extLim}`;
  const sig = computeSignature(payload);

  return {
    key: `PVT-${tier}-${expiryStr}-${sig}`,
    tier,
    expiryStr,
    hwid: hwidTarget,
    maxDev,
    msgLim,
    extLim
  };
}

const opts = parseArgs();
const result = generateKey(opts);

console.log('====================================================');
console.log('🔑 WhatsApp Desktop Suite - License Generator');
console.log('====================================================');
console.log(`License Key    : \x1b[32m\x1b[1m${result.key}\x1b[0m`);
console.log(`Plan Tier      : ${result.tier}`);
console.log(`Duration       : ${result.expiryStr === 'LIFETIME' ? 'LIFETIME (Permanent)' : opts.days + ' Days'}`);
console.log(`Hardware Lock  : ${result.hwid}`);
console.log(`Max WhatsApp Devices : ${result.maxDev}`);
console.log(`Daily Messages Quota : ${result.msgLim}`);
console.log(`Daily Extraction Limit: ${result.extLim}`);
console.log('====================================================');
