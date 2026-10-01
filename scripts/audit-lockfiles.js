#!/usr/bin/env node
'use strict';

/**
 * Lockfile sync guard.
 *
 * `npm ci` refuses to run when package.json and package-lock.json disagree,
 * and it refuses *after* the runner has already spent a minute setting itself
 * up. PR #98 burned a CI run on exactly that: a dependency range was edited by
 * hand and the lockfile never regenerated.
 *
 * This runs the same comparison npm ci does first, offline and with no
 * dependencies of its own, so it works before any install. A lockfile v2/v3
 * records the root package's declared ranges at `packages[""]`; if those drift
 * from package.json, the lockfile is stale.
 *
 * Checks every workspace that has its own lockfile: the app and functions/.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TREES = ['.', 'functions'];
const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

const failures = [];

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    return { __error: err.message };
  }
}

for (const tree of TREES) {
  const label = tree === '.' ? 'app (repo root)' : tree;
  const pkgPath = path.join(ROOT, tree, 'package.json');
  const lockPath = path.join(ROOT, tree, 'package-lock.json');

  if (!fs.existsSync(pkgPath)) {
    failures.push(`${label}: no package.json at ${path.relative(ROOT, pkgPath)}`);
    continue;
  }
  if (!fs.existsSync(lockPath)) {
    failures.push(`${label}: no package-lock.json. Run \`npm install\` in ${tree} and commit it — without a lockfile CI cannot reproduce the install.`);
    continue;
  }

  const pkg = readJson(pkgPath);
  const lock = readJson(lockPath);
  if (pkg.__error) { failures.push(`${label}: package.json is not valid JSON — ${pkg.__error}`); continue; }
  if (lock.__error) { failures.push(`${label}: package-lock.json is not valid JSON — ${lock.__error}`); continue; }

  if (!(lock.lockfileVersion >= 2)) {
    failures.push(`${label}: lockfileVersion is ${lock.lockfileVersion}. v2+ is required (npm 7+); regenerate with \`npm install\`.`);
    continue;
  }

  const rootEntry = (lock.packages || {})[''];
  if (!rootEntry) {
    failures.push(`${label}: package-lock.json has no root entry (packages[""]). Regenerate with \`npm install\`.`);
    continue;
  }

  if (pkg.name && rootEntry.name && pkg.name !== rootEntry.name) {
    failures.push(`${label}: package.json name "${pkg.name}" but lockfile records "${rootEntry.name}". Regenerate with \`npm install\`.`);
  }

  for (const field of FIELDS) {
    const declared = pkg[field] || {};
    const locked = rootEntry[field] || {};

    for (const [name, range] of Object.entries(declared)) {
      if (!(name in locked)) {
        failures.push(`${label}: ${field}.${name} is in package.json but not in the lockfile. Run \`npm install\` in ${tree} and commit package-lock.json.`);
      } else if (locked[name] !== range) {
        failures.push(`${label}: ${field}.${name} is "${range}" in package.json but "${locked[name]}" in the lockfile. Run \`npm install\` in ${tree} and commit package-lock.json.`);
      }
    }
    for (const name of Object.keys(locked)) {
      if (!(name in declared)) {
        failures.push(`${label}: ${field}.${name} is in the lockfile but no longer in package.json. Run \`npm install\` in ${tree} and commit package-lock.json.`);
      }
    }
  }

  // An override that is declared but never materialised means the lockfile was
  // written before the override existed, so the pin is not actually in effect.
  for (const name of Object.keys(pkg.overrides || {})) {
    const seen = Object.keys(lock.packages).some((k) => k === `node_modules/${name}` || k.endsWith(`/node_modules/${name}`));
    if (!seen) {
      failures.push(`${label}: overrides.${name} is declared but no resolved copy of ${name} is in the lockfile. Run \`npm install\` in ${tree} so the pin takes effect.`);
    }
  }
}

if (failures.length) {
  console.error('Lockfile sync check FAILED:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\n${failures.length} problem(s). \`npm ci\` would refuse to install.`);
  process.exit(1);
}

console.log(`Lockfile sync OK — package.json and package-lock.json agree in: ${TREES.map((t) => (t === '.' ? 'repo root' : t)).join(', ')}.`);
