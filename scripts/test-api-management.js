#!/usr/bin/env node
'use strict';

/**
 * Superadmin API management: a provider per feature, per country.
 *
 * The backend has always allowed it - twelve services across seven countries,
 * several providers per service ordered by priority - but the screen showed one
 * flat list of providers with the feature buried in a run-on line, and a single
 * "Add API Provider" button. So the system looked like it could only do Success
 * TopUp, and the catalogue fields added with providerCatalog had nowhere to be
 * typed at all.
 *
 * These checks hold the screen to the shape of the thing it configures.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  ok   ${name}`);
  else { failed += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

const screen = read('src/screens/ApiProviderManagementScreen.js');
const modal = read('src/components/ApiProviderFormModal.js');
const client = read('src/firebase/apiProviderService.js');
const server = read('functions/apiProviderService.js');

console.log('\nThe screen is organised by feature');

check('it lists every service, not every provider',
  /data=\{apiService\.API_SERVICES\}/.test(screen));
check('and groups the providers under the feature they serve',
  /providersFor\s*=\s*\(service\)\s*=>\s*items\.filter\(\(x\)\s*=>\s*x\.service\s*===\s*service\)/.test(screen));
check('ordering them the way the charge path picks one',
  /sort\(\(a,\s*b\)\s*=>\s*Number\(b\.priority\s*\|\|\s*0\)\s*-\s*Number\(a\.priority\s*\|\|\s*0\)\)/.test(screen));
check('each feature can be given its own provider',
  /\+ Add provider for \{service\}/.test(screen));
check('and that opens the form already on that feature',
  /setPresetService\(service\)/.test(screen) && /presetService=\{presetService\}/.test(screen));
check('the per-feature mode switch is still there',
  /setModes\(\(m\)=>\(\{\.\.\.m,\[service\]:'api'\}\)\)/.test(screen));

// The failure that leaves a feature dead: API mode on, nothing configured.
check('API mode with no provider is called out',
  /API mode is on but no provider is configured/.test(screen));

console.log('\nThe form explains itself');

check('fields carry labels, not just placeholders', /fieldLabel/.test(modal) && /SECTIONS/.test(modal));
check('the feature chooser says what it is for',
  /Each one can have its own provider/.test(modal));
check('country precedence is stated',
  /country-specific provider is preferred/.test(modal));

console.log('\nThe catalogue fields can finally be typed');

for (const field of ['catalogPath', 'catalogListPath', 'catalogItemMap', 'catalogWindow', 'catalogTypes', 'catalogPreset']) {
  check(`${field} is editable`, modal.includes(`'${field}'`) || modal.includes(`"${field}"`));
}
check('and the section stays shut for providers that sell no catalogue',
  /optional: true/.test(modal) && /showCatalog/.test(modal));

console.log('\nThe prop the preset depends on');

// Renaming this to `special` during the rewrite would have silently broken the
// Success TopUp setup button: the modal would have rendered the generic form.
check('the modal takes successTopUp', /successTopUp\s*=\s*false/.test(modal));
check('and the screen passes it', /successTopUp=\{successTopUpSetup/.test(screen));

console.log('\nWhat the server will and will not hand back');

check('catalogue configuration comes back, so it can be corrected',
  /catalogPath: x\.catalogPath/.test(server) && /catalogItemMap: x\.catalogItemMap/.test(server));
check('but the catalogue request body does not, like every other template',
  /hasCatalogRequestTemplate: Boolean/.test(server) && !/catalogRequestTemplate: x\.catalogRequestTemplate/.test(server));
check('and neither do the credentials', !/apiKey: x\.apiKey/.test(server));

console.log('\nThe feature list both sides agree on');

const serverList = server.match(/const ALLOWED_SERVICES = \[([^\]]*)\]/);
const clientList = client.match(/export const API_SERVICES = \[([^\]]*)\]/);
check('both lists are readable', Boolean(serverList && clientList));
if (serverList && clientList) {
  const parse = (m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  const s = parse(serverList);
  const c = parse(clientList);
  check(`all ${s.length} routed services are offered`, s.every((x) => c.includes(x)),
    s.filter((x) => !c.includes(x)).join(', '));
}

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('Every feature can be given its own API, from its own provider, per country.');
