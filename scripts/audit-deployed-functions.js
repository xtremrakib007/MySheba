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

function stripAnsi(text) {
  // Redirected output can still carry colour codes, which break every match.
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/** `firebase functions:list --json` - much the most reliable input. */
function parseJsonListing(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed
    : Array.isArray(parsed.result) ? parsed.result
      : Array.isArray(parsed.functions) ? parsed.functions
        : null;
  if (!list) return null;
  const rows = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    // Field names have moved between CLI versions, so take the first that fits
    // rather than insisting on one spelling.
    const name = String(item.id || item.functionName || item.name || '').split('/').pop();
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) continue;
    rows.push({
      name,
      runtime: String(item.runtime || item.serviceConfig?.runtime || item.buildConfig?.runtime || ''),
      region: String(item.region || item.location || ''),
    });
  }
  return rows.length ? rows : null;
}

/**
 * The human table, in whatever shape the CLI printed it.
 *
 * The first version of this insisted on box-drawing pipes, which is what the
 * table looks like in a terminal - and then found nothing at all in a
 * redirected file. Any of │ or | separates columns, and a file with neither is
 * read as whitespace columns, so a plain listing still works.
 */
function parseTableListing(text) {
  const rows = [];
  for (const raw of stripAnsi(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (/[│|]/.test(line) ? line.split(/[│|]/) : line.split(/\s{2,}|\t/))
      .map((c) => c.trim())
      .filter((c) => c !== '');
    if (!cells.length) continue;
    const name = cells[0];
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) continue;
    if (name === 'Function' || name === 'Name') continue;
    // Found by shape, not by column number, so a reordered table still reads
    // the right field.
    const runtime = cells.find((c) => /^nodejs\d+$/.test(c)) || '';
    const region = cells.find((c) => /^[a-z]+-[a-z]+\d+$/.test(c)) || '';
    // A bare word on its own line is not a function row; require either a
    // recognisable runtime/region or a plausible multi-column row.
    if (!runtime && !region && cells.length < 3) continue;
    rows.push({ name, runtime, region });
  }
  return rows;
}

function parseListing(text) {
  return parseJsonListing(text) || parseTableListing(text);
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
    const sample = fs.readFileSync(file, 'utf8').split('\n').slice(0, 8);
    console.error('No functions parsed from that file.');
    console.error('The most reliable input is JSON:');
    console.error(`  firebase functions:list --project <id> --json > ${path.basename(file)}`);
    console.error('\nThe first lines of what was read:');
    for (const line of sample) console.error(`  | ${line}`);
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
