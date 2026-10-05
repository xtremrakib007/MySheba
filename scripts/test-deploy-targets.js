#!/usr/bin/env node
'use strict';
/**
 * The deploy filter, checked against the entrypoint.
 *
 * Three deploys were spent on `functions:executeConfiguredApi`, an internal
 * helper that was never deployable. Firebase rejects the whole batch for one
 * bad name, and only after analysing and uploading the bundle. Worse, the
 * hand-written list that replaced it omitted the charge* callables - the ones
 * that actually dispatch a recharge - so the routing fix would have been
 * uploaded without reaching the code path it fixes.
 */
const assert = require('assert');
const { exportedFunctions, functionsDependingOn, unknownNames } = require('./lib/exported-functions');

const exported = exportedFunctions();
assert(exported.size > 100, `expected the entrypoint to export many functions, saw ${exported.size}`);

// The deployed entrypoint is secureIndexV2.js, not index.js - functions/package.json
// says so. It attaches about thirty callables index.js never exports, and
// reading index.js alone reported every one of them as undeployable: a correct
// `deploy:functions walletTransfer` was refused with "did you mean
// listWalletTransfers". The chain has to be followed, and the later file wins.
assert.strictEqual(exported.get('walletTransfer'), 'secureWalletTransfer',
  'a callable attached only by secureIndexV2 must be deployable, and resolve to its own module');
for (const name of ['rejectTransaction', 'approveTransaction', 'saveSalarySettings']) {
  assert(exported.has(name), `${name} is attached by secureIndexV2 and must be deployable`);
}

// Both export shapes index.js uses must be understood. If either stops
// resolving, the derived list silently shrinks and a deploy silently skips
// whatever it dropped.
assert.strictEqual(exported.get('saveApiProvider'), 'apiProviderService', 'an inline-require export must resolve');
assert.strictEqual(exported.get('chargeRecharge'), 'chargeGuards', 'const-alias exports must resolve');

// The name that cost three deploys.
assert.deepStrictEqual(unknownNames(['executeConfiguredApi']).map((x) => x.name), ['executeConfiguredApi'],
  'an internal helper must be reported as not deployable');
assert.deepStrictEqual(unknownNames(['saveApiProvider', 'chargeRecharge']), [],
  'real functions must not be flagged');

const group = functionsDependingOn(['apiProviderService', 'apiWebhookService', 'successTopupPoller']);

// The charge callables are the point. They reach apiProviderService through
// chargeGuards -> walletService, so nothing about their names says they carry
// the API code - which is exactly why a hand-kept list left them out.
for (const name of ['chargeRecharge', 'chargeInternetPackage', 'chargeBillPayment', 'chargeOfferPacks', 'chargeEntertainment']) {
  assert(group.includes(name), `${name} dispatches orders and must be redeployed with the API code`);
}
for (const name of ['saveApiProvider', 'listApiProviders', 'getServiceApiSettings', 'saveServiceApiSettings', 'apiWebhook', 'getSuccessTopUpBalance', 'pollSuccessTopUpStatus']) {
  assert(group.includes(name), `${name} must be in the API deploy group`);
}

// And it must stay a group, not creep into "everything". transferPoints is
// secureTransfer and never touches a provider; a hand-kept list had it anyway.
assert(!group.includes('transferPoints'), 'transferPoints does not carry the API code');
assert(group.length < exported.size / 2, `the group should be a subset, saw ${group.length} of ${exported.size}`);

// Anything derived must be deployable, or the script builds a filter Firebase
// will reject in full.
assert.deepStrictEqual(unknownNames(group), [], 'every derived name must be exported from index.js');

// ---------------------------------------------------------------------------
// Every way this project ships must refuse a stale checkout. The admin site
// was the one that did not, and it shipped a bundle a commit behind without
// saying so - the exact failure the guard was written for, through the one
// door it was not on.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const readFile = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const scripts = JSON.parse(readFile('package.json')).scripts;
for (const name of ['deploy:functions', 'deploy:rules', 'deploy:web', 'publish:ota']) {
  assert(scripts[name], `${name} must exist - a shipping path without a script is one nobody guards`);
  const source = readFile(scripts[name].replace(/^node /, ''));
  assert(/requireCurrentCheckout\(/.test(source), `${name} must refuse a checkout that is not origin/main`);
}

const web = readFile('scripts/deploy-web.js');
// Named target, from the repo root. A bare `--only hosting` run from inside
// admin-web/ picks up that directory's own config, where the site is
// untargeted - so what it deploys depends on which directory you are in.
assert(/'--only', 'hosting:admin-web'/.test(web), 'the admin deploy must name its target');
assert(/cwd: ROOT/.test(web), 'and run from the root, where .firebaserc defines that target');
// A failed build leaves the previous dist/ in place, so deploying anyway
// uploads a stale bundle and reports success.
assert(/if \(build\.status !== 0\)/.test(web), 'a failed build must stop the deploy');
assert(web.indexOf('requireCurrentCheckout(') < web.indexOf("spawnSync('npm'"),
  'the checkout is checked before anything is built');

console.log(`deploy targets: PASS (${group.length} of ${exported.size} functions carry the API code)`);
