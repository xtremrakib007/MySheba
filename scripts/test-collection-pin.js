#!/usr/bin/env node
/**
 * Collection PIN policy:
 * - Recharge, Internet, Bill Payment and Recharge PIN never use a collection PIN.
 * - Mobile Banking and Remittance require the operator to enter the collection
 *   PIN when completing the order.
 * - The app/backend must not expose a customer-facing collection-PIN generator.
 */
const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, '..', 'functions', 'transactionService.js'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'collectionPin.js'), 'utf8');
const detail = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'TransactionDetailModal.js'), 'utf8');
const secureIndex = fs.readFileSync(path.join(__dirname, '..', 'functions', 'secureIndexV2.js'), 'utf8');

const failures = [];
function check(name, ok, detailText='') {
  if (!ok) failures.push(name + (detailText ? ': ' + detailText : ''));
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detailText && !ok ? '\n       ' + detailText : ''));
}

check('server still validates a safe PIN digit range',
  /const PIN_MIN = 4;/.test(server) &&
  /const PIN_MAX = 12;/.test(server) &&
  /const PIN_RE = new RegExp/.test(server));

check('collection PIN is required only for Mobile Banking and Remittance',
  /const requiresCollectionPin = service === 'Mobile Banking' \|\| service === 'Remittance';/.test(server));

check('operator-entered PIN is stored at completion',
  /completionUpdate\.collectionPin = requiresCollectionPin \? pin : admin\.firestore\.FieldValue\.delete\(\);/.test(server));

check('live PIN field is deleted after completion',
  /pin: admin\.firestore\.FieldValue\.delete\(\)/.test(server));

check('automatic collection PIN generation is removed from backend',
  !/exports\.generateCollectionPin/.test(server) &&
  !/mintPin\(/.test(server) &&
  !/PIN_LENGTH_BY_SERVICE/.test(server));

check('automatic collection PIN callable is not exported',
  !/generateCollectionPin/.test(secureIndex));

check('client collection PIN generator is removed',
  !/generateCollectionPin/.test(detail));

check('transaction detail shows collection PIN only for Mobile Banking/Remittance',
  /item\.service === 'Mobile Banking' \|\| item\.service === 'Remittance'/.test(detail));

check('client utility defines the same allowed collection-PIN services',
  /new Set\(\['Mobile Banking', 'Remittance'\]\)/.test(client));

for (const file of ['DealerHomeScreen.js', 'ResellerHomeScreen.js', 'AdminHomeScreen.js']) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', file), 'utf8');
  check(file + ' does not request collection PIN for every service',
    /tx\.service === 'Mobile Banking' \|\| tx\.service === 'Remittance'/.test(src));
}

if (failures.length) {
  console.error('\n' + failures.length + ' failure(s).');
  process.exit(1);
}
console.log('\nCollection PIN policy: all checks pass.');
