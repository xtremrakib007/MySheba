#!/usr/bin/env node
'use strict';

/**
 * What is deployed, against what this repository actually contains.
 *
 * Deleting a function from the source does NOT delete it from the project. The
 * deploy only creates and updates; anything you stop exporting is simply left
 * running, on whatever runtime and whatever code it had the day it was last
 * touched. Nothing in this repo noticed, so five of them sat live for months:
 *
 *   boostListing         retired with the Marketplace/Social modules
 *   chargeGamePoints     retired with Game Points
 *   giftGamePoints       retired with Game Points
 *   generateAgoraToken   deleted in 842f47f, a commit labelled "security:"
 *   createUserAccount    never in this repository at all
 *
 * All five were still callable, all five on the deprecated nodejs20, and all
 * five running code nobody can review because it is not here. A retired
 * function that still answers is worse than a deprecated runtime: the guards
 * added since - session proof, App Check, velocity limits, the charge guards -
 * exist only in the code that replaced it.
 *
 * This is an offline check, because listing deployments needs credentials this
 * repo does not and should not hold:
 *
 *   firebase functions:list --project <id> > deployed.txt
 *   npm run audit:deployed deployed.txt
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function parseListing(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    // The CLI prints a box-drawn table; borders have no word characters.
    if (!line.includes('│')) continue;
    const cells = line.split('│').map((c) => c.trim()).filter((c) => c !== '');
    if (cells.length < 2) continue;
    const name = cells[0];
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) continue; // skips the header
    if (name === 'Function') continue;
    // Runtime is whichever cell looks like one, rather than a fixed column, so
    // a CLI that adds or reorders columns does not silently read the wrong one.
    const runtime = cells.find((c) => /^nodejs\d+$/.test(c)) || '';
    const region = cells.find((c) => /^[a-z]+-[a-z]+\d+$/.test(c)) || '';
    rows.push({ name, runtime, region });
  }
  return rows;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npm run audit:deployed <file>');
    console.error('  firebase functions:list --project <id> > deployed.txt');
    process.exit(2);
  }
  if (!fs.existsSync(file)) {
    console.error(`No such file: ${file}`);
    process.exit(2);
  }

  const deployed = parseListing(fs.readFileSync(file, 'utf8'));
  if (!deployed.length) {
    console.error('No functions parsed from that file. Is it the output of `firebase functions:list`?');
    process.exit(2);
  }

  const pkg = require(path.join(ROOT, 'functions', 'package.json'));
  const expectedRuntime = `nodejs${String(pkg.engines?.node || '').trim()}`;
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'audit-deployed';
  const exported = new Set(Object.keys(require(path.join(ROOT, 'functions', pkg.main || 'index.js'))));

  const orphans = deployed.filter((f) => !exported.has(f.name));
  const staleRuntime = deployed.filter((f) => exported.has(f.name) && f.runtime && f.runtime !== expectedRuntime);
  const undeployed = [...exported].filter((name) => !deployed.some((f) => f.name === name));

  console.log(`\n${deployed.length} deployed; ${exported.size} exported by functions/${pkg.main || 'index.js'}; expected runtime ${expectedRuntime}.`);

  if (orphans.length) {
    console.log(`\nDEPLOYED BUT NOT IN THIS REPOSITORY (${orphans.length}) — still callable, running code that is not here:`);
    for (const f of orphans) console.log(`  - ${f.name}${f.runtime ? `  [${f.runtime}]` : ''}${f.region ? `  ${f.region}` : ''}`);
    const byRegion = new Map();
    for (const f of orphans) {
      const key = f.region || 'us-central1';
      if (!byRegion.has(key)) byRegion.set(key, []);
      byRegion.get(key).push(f.name);
    }
    console.log('\n  Delete them with:');
    for (const [region, names] of byRegion) {
      console.log(`    firebase functions:delete ${names.join(' ')} --region ${region}`);
    }
    console.log('  Check each one is genuinely retired first: deleting is not reversible,');
    console.log('  and an old client build may still be calling it.');
  }

  if (staleRuntime.length) {
    console.log(`\nSTALE RUNTIME (${staleRuntime.length}) — in the source but last deployed on an older Node:`);
    for (const f of staleRuntime) console.log(`  - ${f.name}  ${f.runtime} (expected ${expectedRuntime})`);
    console.log('  A redeploy picks up functions/package.json engines.node.');
  }

  if (undeployed.length) {
    console.log(`\nEXPORTED BUT NOT DEPLOYED (${undeployed.length}) — the clients will get not-found:`);
    for (const name of undeployed.slice(0, 40)) console.log(`  - ${name}`);
    if (undeployed.length > 40) console.log(`  ... and ${undeployed.length - 40} more`);
  }

  console.log('');
  if (orphans.length || staleRuntime.length) {
    console.error(`${orphans.length} orphan(s) and ${staleRuntime.length} stale runtime(s) need attention.`);
    process.exit(1);
  }
  console.log('Everything deployed is in this repository, on the expected runtime.');
}

// Guarded so the parser can be exercised without running the audit.
if (require.main === module) main();
module.exports = { parseListing };
