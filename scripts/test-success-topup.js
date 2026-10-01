#!/usr/bin/env node
'use strict';

/**
 * Success TopUp contract checks.
 *
 * The bug that prompted these was silent and expensive: the recharge operator
 * map held three of the eight codes Success TopUp documents, and the lookup
 * fell back to forwarding the operator's DISPLAY NAME. src/data/countries.js
 * offers six Bangladesh operators, so Airtel, Teletalk and Skitto recharges
 * sent operator:"Airtel" instead of "AT" - rejected by the provider, after the
 * wallet had already been charged. Nothing failed at build or lint time.
 *
 * What the API documents (SUCCESS_TOPUP_SETUP.md, and
 * successtopup.com/recharge-api-documentation):
 *   POST /api/recharge  number, type, operator, amount, [package_id], trxid
 *   POST /api/bill-pay  billOperator, billNumber, billAmount, mobileNumber,
 *                       monthName, [note], trxid
 *   POST /api/drives    operator, type            (catalogue listing)
 *   POST /api/status    transaction status
 * Credentials travel as successtopup_key / successtopup_secret in the body.
 *
 * There is no separate package or entertainment endpoint: a bundle is bought by
 * naming its id from /api/drives on /api/recharge. Internet and Entertainment
 * must therefore stay on one code path.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const failures = [];
let checks = 0;

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { failures.push(`${rel} is missing.`); return null; }
  return fs.readFileSync(p, 'utf8');
};

const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

function check(name, fn) {
  checks += 1;
  try { const problem = fn(); if (problem) failures.push(`${name}: ${problem}`); }
  catch (err) { failures.push(`${name}: check threw - ${err.message}`); }
}

// Every operator code Success TopUp documents.
const DOCUMENTED = { GP: 'Grameenphone', RB: 'Robi', BL: 'Banglalink', AT: 'Airtel', TT: 'Teletalk', SK: 'Skitto', BT: 'Brilliant Connect', RY: 'Ryze' };

check('every Bangladesh operator the app offers maps to a Success TopUp code', () => {
  const countriesSrc = read('src/data/countries.js');
  const serverSrc = read('functions/apiProviderService.js');
  if (!countriesSrc || !serverSrc) return 'unreadable';

  const block = /rechargeOperators\s*=\s*\{[\s\S]*?\n\}/.exec(countriesSrc);
  if (!block) return 'could not find rechargeOperators in src/data/countries.js.';
  const bd = /BD:\s*\[([^\]]*)\]/.exec(block[0]);
  if (!bd) return 'rechargeOperators has no BD list.';
  const offered = [...bd[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] || m[2]);
  if (!offered.length) return 'the BD operator list is empty.';

  const mapBlock = /SUCCESS_TOPUP_OPERATORS\s*=\s*\{([\s\S]*?)\}/.exec(code(serverSrc));
  if (!mapBlock) return 'functions/apiProviderService.js has no SUCCESS_TOPUP_OPERATORS map.';
  const mapped = new Map([...mapBlock[1].matchAll(/'?([A-Za-z][A-Za-z ]*)'?\s*:\s*'([A-Z]{2})'/g)].map((m) => [m[1].trim(), m[2]]));

  const missing = offered.filter((op) => !mapped.has(op));
  if (missing.length) {
    return `${missing.join(', ')} appear in the app's BD operator picker but have no Success TopUp code. `
      + 'A recharge for them is charged to the wallet and then rejected by the provider.';
  }
  const wrong = offered.filter((op) => DOCUMENTED[mapped.get(op)] !== op);
  if (wrong.length) return `${wrong.map((op) => `${op}->${mapped.get(op)}`).join(', ')} do not match the documented codes.`;
  return null;
});

check('an unmappable operator fails before the provider is called', () => {
  const src = read('functions/apiProviderService.js');
  if (!src) return 'unreadable';
  const body = code(src);
  if (/SUCCESS_TOPUP_OPERATORS\[[^\]]+\]\s*\|\|\s*String\(/.test(body)) {
    return 'the operator lookup still falls back to forwarding the raw value. An unknown operator must throw, '
      + 'not reach Success TopUp as a display name.';
  }
  if (!/function resolveSuccessTopUpOperator/.test(body)) return 'resolveSuccessTopUpOperator is gone.';
  if (!/isSuccessTopUpRecharge\s*&&\s*!rechargeOperator/.test(body)) {
    return 'there is no guard rejecting a recharge whose operator could not be resolved.';
  }
  return null;
});

check('Internet and Entertainment share the documented package path', () => {
  const src = read('functions/apiProviderService.js');
  if (!src) return 'unreadable';
  const body = code(src);
  const list = /SUCCESS_TOPUP_PACKAGE_SERVICES\s*=\s*\[([^\]]*)\]/.exec(body);
  if (!list) return 'SUCCESS_TOPUP_PACKAGE_SERVICES is missing.';
  for (const service of ['Internet', 'Entertainment']) {
    if (!list[1].includes(`'${service}'`)) return `${service} is not in SUCCESS_TOPUP_PACKAGE_SERVICES.`;
  }
  if (!/package_id:\s*vars\.packageId/.test(body)) return 'the dispatched body no longer sends package_id.';
  if (!/isSuccessTopUpInternet\s*&&\s*!vars\.packageId/.test(body)) {
    return 'a package purchase with no packageId is no longer rejected; it would bill the wallet and buy a plain top-up.';
  }
  return null;
});

check('the stored provider template matches what is dispatched', () => {
  const src = read('functions/apiProviderService.js');
  if (!src) return 'unreadable';
  const body = code(src);
  // successTopUpInternet was computed and never read, so Superadmin was shown
  // the plain recharge template for an Internet provider.
  const decl = /const\s+(successTopUp[A-Za-z]*)\s*=/g;
  for (const m of body.matchAll(decl)) {
    const name = m[1];
    const uses = (body.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
    if (uses < 2) return `${name} is assigned but never read in validate(), so the stored config cannot reflect it.`;
  }
  if (!/successTopUpPackage\s*\?[\s\S]{0,400}package_id:/.test(body)) {
    return 'the stored request template for a package service does not include package_id.';
  }
  return null;
});

check('the Success TopUp branch\'s overrides survive into the stored provider', () => {
  const svc = require(path.join(ROOT, 'functions', 'apiProviderService.js'));
  const validate = svc._test && svc._test.validate;
  if (typeof validate !== 'function') return 'functions/apiProviderService.js no longer exports _test.validate.';
  for (const service of ['Recharge', 'Internet', 'Entertainment', 'Bill Payment']) {
    const out = validate({ service, name: 'success topup', apiKey: 'k', secretKey: 's', priority: 1 });
    if (out.name !== 'Success TopUp') return `${service}: name was not normalised.`;
    if (out.country !== 'BD') return `${service}: country is ${out.country}, not BD.`;
    if (out.method !== 'POST' || out.authType !== 'none') return `${service}: method/auth were not forced.`;
    // 9999 is how Success TopUp wins executeConfiguredApi's priority sort. The
    // branch set it and the return statement recomputed it from data.priority,
    // storing 0 and letting any other BD provider outrank it.
    if (out.priority !== 9999) return `${service}: priority is ${out.priority}, not 9999 - the branch's value was discarded.`;
    const expectedPath = service === 'Bill Payment' ? '/api/bill-pay' : '/api/recharge';
    if (out.endpointPath !== expectedPath) return `${service}: endpointPath is ${out.endpointPath}, expected ${expectedPath}.`;
    if (['Internet', 'Entertainment'].includes(service) && !('package_id' in out.requestTemplate)) {
      return `${service}: the stored template has no package_id, so Superadmin is shown a body that is not what gets sent.`;
    }
  }
  // A provider that is not Success TopUp must still keep its own priority.
  const other = validate({ service: 'Recharge', name: 'Other', baseUrl: 'https://x.example.com', priority: 42 });
  if (other.priority !== 42) return `a non-Success TopUp provider lost its priority (${other.priority}).`;
  return null;
});

check('bill payment matches the documented /api/bill-pay fields', () => {
  const src = read('functions/apiProviderService.js');
  if (!src) return 'unreadable';
  const body = code(src);
  if (!/'\/api\/bill-pay'/.test(body)) return 'the /api/bill-pay endpoint is gone.';
  for (const field of ['billOperator', 'billNumber', 'billAmount', 'mobileNumber', 'monthName', 'trxid']) {
    if (!new RegExp(`${field}:`).test(body)) return `the bill-pay template no longer sends ${field}.`;
  }
  return null;
});

check('every service the provider dispatches can be charged', () => {
  const wallet = read('functions/walletService.js');
  const guards = read('functions/chargeGuards.js');
  const client = read('src/firebase/transactionService.js');
  if (!wallet || !guards || !client) return 'unreadable';
  // A label in SERVICE_BY_CALLABLE with no key in walletService, or a client
  // callable name that is not wrapped, is an order that cannot be placed.
  const labels = [...code(guards).matchAll(/charge[A-Za-z]+:\s*'([^']+)'/g)].map((m) => m[1]);
  for (const label of labels) {
    const key = label.toLowerCase().replace(/\s+/g, '');
    if (!new RegExp(`${key}:\\s*'${label.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')}'`).test(code(wallet))) {
      return `chargeGuards offers "${label}" but walletService's serviceLabel map has no ${key} entry.`;
    }
    if (!new RegExp(`\\b${key}\\b`).test(code(wallet))) return `walletService never handles the ${key} service key.`;
  }
  for (const [, fnName] of code(client).matchAll(/'?[A-Za-z ]+'?:\s*'(charge[A-Za-z]+)'/g)) {
    if (!new RegExp(`exports\\.${fnName}\\s*=`).test(code(guards))) {
      return `the app calls ${fnName} but chargeGuards does not export it.`;
    }
  }
  return null;
});

check('Entertainment is wired end to end', () => {
  const files = {
    'functions/chargeGuards.js': [/chargeEntertainment:\s*'Entertainment'/, /exports\.chargeEntertainment\s*=/],
    'functions/walletService.js': [/entertainment:\s*'Entertainment'/, /entertainment:\s*new Set\(/, /service==='entertainment'/],
    'functions/index.js': [/exports\.chargeEntertainment\s*=/],
    'functions/secureIndexV2.js': [/functions\.chargeEntertainment\s*=/],
    'src/firebase/transactionService.js': [/Entertainment:\s*'chargeEntertainment'/],
    'src/context/AppContext.js': [/entertainment:\s*"Entertainment"/, /entertainment:\s*4/, /service === "entertainment"/],
    'src/steps/EntertainmentSteps.js': [/listSuccessTopUpDrives/, /packageId/],
  };
  for (const [rel, patterns] of Object.entries(files)) {
    const src = read(rel);
    if (!src) return `${rel} unreadable`;
    for (const re of patterns) {
      if (!re.test(code(src))) return `${rel} is missing ${re}`;
    }
  }
  const steps = read('src/steps/EntertainmentSteps.js');
  if (/Coming Soon/i.test(steps || '')) return 'EntertainmentSteps is still the Coming Soon placeholder.';
  return null;
});

check('the app never holds a literal Success TopUp credential', () => {
  const dir = path.join(ROOT, 'src');
  const hits = [];
  const assigned = /successtopup_(?:key|secret)\s*:\s*(['"`])([^'"`]*)\1/g;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx|ts|tsx)$/.test(e.name)) continue;
      const body = fs.readFileSync(full, 'utf8');
      for (const m of body.matchAll(assigned)) {
        const value = m[2].trim();
        // '' and '{{apiKey}}' are placeholders the server fills in. Anything
        // else is a real credential sitting in the shipped bundle.
        if (value && !/^\{\{\s*[A-Za-z0-9_]+\s*\}\}$/.test(value)) {
          hits.push(`${path.relative(ROOT, full)} assigns a literal value`);
        }
      }
      // A key/secret must never be read from app config either.
      if (/(?:EXPO_PUBLIC_[A-Z_]*SUCCESS|successTopUpSecret|successtopupSecret)/.test(body)) {
        hits.push(`${path.relative(ROOT, full)} reads a Success TopUp secret from app config`);
      }
    }
  };
  walk(dir);
  return hits.length
    ? `${[...new Set(hits)].join('; ')}. Success TopUp credentials are server-only and must never ship in the bundle.`
    : null;
});

if (failures.length) {
  console.error('Success TopUp contract FAILED:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\n${failures.length} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`Success TopUp contract: ${checks} checks passed.`);
