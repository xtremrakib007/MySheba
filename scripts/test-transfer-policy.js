#!/usr/bin/env node
/**
 * The app's copy of the transfer rule must agree with the server's.
 *
 * src/utils/transferPolicy.js exists so the Send To list only offers
 * transfers that will be accepted. That is only worth anything while it
 * matches functions/secureTransfer.js, which is the authority - and the two
 * are separate bundles, so nothing links them. If the client drifts wider,
 * people are offered transfers that get refused after they enter a PIN. If
 * it drifts narrower, legitimate recipients quietly vanish from the list.
 *
 * This loads BOTH implementations and compares them across every role pair.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function serverRule() {
  const src = fs.readFileSync(path.join(ROOT, 'functions', 'secureTransfer.js'), 'utf8');
  const start = src.indexOf('function canTransferTo(');
  const end = src.indexOf('function validBalance(');
  if (start < 0 || end < 0) throw new Error('could not find canTransferTo in functions/secureTransfer.js');
  const box = { module: { exports: {} } };
  vm.createContext(box);
  vm.runInContext(`${src.slice(start, end)}\nmodule.exports = canTransferTo;`, box);
  return box.module.exports;
}

function clientRule() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'transferPolicy.js'), 'utf8');
  const start = src.indexOf('export function canTransferTo(');
  const end = src.indexOf('/** Who a sender may actually be shown');
  if (start < 0 || end < 0) throw new Error('could not find canTransferTo in src/utils/transferPolicy.js');
  const box = { module: { exports: {} } };
  vm.createContext(box);
  vm.runInContext(`${src.slice(start, end).replace('export ', '')}\nmodule.exports = canTransferTo;`, box);
  return box.module.exports;
}

const server = serverRule();
const client = clientRule();

const ROLES = ['customer', 'dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin', undefined];
const ME = 'uid-me';
const OTHER = 'uid-other';

let failed = 0;
let compared = 0;
const disagreements = [];

for (const senderRole of ROLES) {
  for (const recipientRole of ROLES) {
    for (const dealerId of [ME, OTHER, undefined]) {
      const recipient = { role: recipientRole, dealerId };
      // The server reads the sender's own uid off `caller.id`.
      const s = server(senderRole, { id: ME }, recipient);
      const c = client(senderRole, ME, recipient);
      compared += 1;
      if (Boolean(s) !== Boolean(c)) {
        failed += 1;
        disagreements.push(`${senderRole} -> ${recipientRole} (dealerId ${dealerId === ME ? 'mine' : dealerId === OTHER ? "someone else's" : 'unset'}): server ${Boolean(s)}, app ${Boolean(c)}`);
      }
    }
  }
}

console.log(`Compared ${compared} sender/recipient combinations.`);
if (disagreements.length) {
  console.error(`\n${disagreements.length} disagreement(s) between the app and the server:\n`);
  disagreements.forEach((d) => console.error(`  ${d}`));
  process.exit(1);
}
console.log('  ok    the app and the server agree on every one');

// The rule itself, stated once, so a change to BOTH copies still gets noticed.
const expect = (label, got, want) => {
  if (got === want) { console.log(`  ok    ${label}`); return; }
  failed += 1;
  console.error(`  FAIL  ${label}\n          got ${got}, want ${want}`);
};
console.log('\nThe rule as intended:');
expect('superadmin -> admin', client('superadmin', ME, { role: 'admin' }), true);
expect('superadmin -> dealer', client('superadmin', ME, { role: 'dealer' }), true);
expect('superadmin -> customer is NOT allowed', client('superadmin', ME, { role: 'customer' }), false);
expect('admin -> dealer', client('admin', ME, { role: 'dealer' }), true);
expect('admin -> customer is NOT allowed', client('admin', ME, { role: 'customer' }), false);
expect('admin -> admin is NOT allowed', client('admin', ME, { role: 'admin' }), false);
expect('dealer -> their own customer', client('dealer', ME, { role: 'customer', dealerId: ME }), true);
expect("dealer -> another dealer's customer is NOT allowed", client('dealer', ME, { role: 'customer', dealerId: OTHER }), false);
expect('dealer -> dealer is NOT allowed', client('dealer', ME, { role: 'dealer' }), false);
expect('reseller cannot send', client('reseller', ME, { role: 'customer', dealerId: ME }), false);
expect('customer cannot send', client('customer', ME, { role: 'customer', dealerId: ME }), false);
expect('support cannot send', client('support', ME, { role: 'dealer' }), false);
expect('finance cannot send', client('finance', ME, { role: 'dealer' }), false);

// ---------------------------------------------------------------------------
// And every client that can start a transfer must collect the PIN.
//
// The admin site had no PIN field at all, so the server refused every transfer
// with "Enter your 4-8 digit security PIN." and there was nowhere to enter it.
// A page that cannot complete the only thing it does.
// ---------------------------------------------------------------------------
const readFile = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function check(name, condition) {
  if (condition) { console.log('  ok  ' + name); return; }
  console.error('  FAIL  ' + name);
  failed += 1;
}

console.log('\nBoth clients send the PIN the server demands');

const transferSource = readFile('functions/secureTransfer.js');
check('the server still requires it', /SECURITY_PIN_RE\.test\(securityPin\)/.test(transferSource));

const webService = readFile('admin-web/src/services/pointTransferService.ts');
const webPage = readFile('admin-web/src/pages/TransferPointsPage.tsx');

check('the web service sends it', /securityPin: input\.securityPin/.test(webService));
check('and will not call without one', /if \(!SECURITY_PIN_RE\.test\(input\.securityPin\)\) throw new Error/.test(webService));
// The server's own rule, copied. Five wrong PINs lock the account for an hour,
// so a malformed one must not reach it.
check('the web rule is the same rule', /SECURITY_PIN_RE = \/\^\\d\{4,8\}\$\//.test(webService));
check('the server rule is still 4-8 digits', /\/\^\\d\{4,8\}\$\//.test(transferSource + readFile('functions/walletTransferService.js')));

check('the page has a field to type it in', /value=\{securityPin\}/.test(webPage));
check('and hides it while typing', /type="password"/.test(webPage));
check('the send button waits for it', /!securityPin\}/.test(webPage));
check('the page passes it to the service', /transferPoints\(\{ toUid: selected\.id, amount: amt, note, securityPin \}\)/.test(webPage));
// A wrong PIN left in the box and re-sent on a second click spends another of
// the five attempts before the account is locked.
check('the PIN is cleared after a failure', /setError\(\(err as Error\)\.message\);\s*setSecurityPin\(''\);/.test(webPage));
check('and after a success', /setSearch\(''\);[\s\S]{0,300}setSecurityPin\(''\);/.test(webPage));

// The app already did this; it is checked so the two cannot drift apart again.
const appScreen = readFile('src/screens/TransferPointsScreen.js');
check('the app sends it too', /securityPin: pinToSend/.test(appScreen));

// ---- Who can actually REACH a transfer ----
//
// The rule above is only worth anything to somebody who has a way to start
// one. Finance moves money for a living and had no wallet on their home
// screen at all: the card with Add Money and Transfer was on the Control
// Center, which is an admin screen, and utils/homeScreen sends finance to
// staffHome instead. So the policy allowed a transfer the UI never offered.
console.log('\nA role that may transfer has somewhere to start one');
const staffHome = readFile('src/screens/StaffHomeScreen.js');
check('the staff home renders the wallet card',
  /<WalletCard/.test(staffHome) && /import WalletCard from '\.\.\/components\/WalletCard'/.test(staffHome));
check('with a Transfer action that goes to the transfer screen',
  /onTransfer=\{\(\) => setScreen\('transferPoints'\)\}/.test(staffHome));
check('and an Add Money action that goes where this role may actually go',
  // Not superAdminTopup: AppContext's route guard restricts that one to
  // superadmin, so a finance agent tapping it would be bounced.
  /onAddMoney=\{\(\) => setScreen\('walletFunding'\)\}/.test(staffHome)
    && !/superAdminTopup/.test(staffHome));
check('gated on the capability the server checks, not on the role name',
  // functions/secureTransfer.js asks hasCapability(..., 'finance') for every
  // non-dealer caller. Gating on role would offer a support agent a button
  // that fails server-side.
  /\{!!can\('finance'\) && \(/.test(staffHome) && /can \} = useApp\(\)/.test(staffHome));
check('the balance is read the same way the admin screen reads it',
  // Three spellings exist across the roles; reading one showed finance a zero
  // balance on an account with money in it.
  /profile\?\.balance \?\? profile\?\.walletBalance \?\? profile\?\.wallet\?\.balance/.test(staffHome)
    && /profile\?\.balance \?\? profile\?\.walletBalance \?\? profile\?\.wallet\?\.balance/.test(readFile('src/screens/AdminFeaturesScreen.js')));
check('and admin still has its own',
  // [^>]* does not work here: the arrow in `() =>` is a '>'.
  /<WalletCard balance=\{balance\}[\s\S]*?onTransfer=\{\(\) => setScreen\('transferPoints'\)\}/.test(readFile('src/screens/AdminFeaturesScreen.js')));
check('every role that lands on the staff home is one the server may let transfer',
  // staffHome is support and finance. Support holding 'finance' is a grant a
  // superadmin made on purpose; support without it sees no card at all.
  /STAFF_HOME_ROLES = \['support', 'finance'\]/.test(readFile('src/utils/homeScreen.js')));

console.log(failed ? `\n${failed} failure(s).` : '\nTransfer policy: the app matches the server.');
process.exit(failed ? 1 : 0);
