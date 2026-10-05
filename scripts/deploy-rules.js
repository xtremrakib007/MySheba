#!/usr/bin/env node
/**
 * Deploy firestore.rules and firestore.indexes.json, which nothing in this
 * repo ever did.
 *
 * deploy:functions sends `--only functions`, and test:rules only runs the
 * rules against a local emulator. So every rule written here stayed here. The
 * cost showed up as "Missing or insufficient permissions" on a feature whose
 * code had shipped and whose rule had not:
 *
 *   settings/webviews   the WebView editor could not save
 *   settings/gridManagement  the byRole / byCountry / byUser allowlist, so a
 *                       scoped grid override was refused the same way
 *
 * Both looked like broken features. Neither was.
 *
 * Indexes go with them, for the same reason and with the same symptom. A
 * composite query without its index fails at the moment somebody uses it -
 * `listInvoices` filtered by kind is one - and the fix is a file in this repo
 * that no deploy here ever sent. Indexes are additive: deploying them creates
 * what is missing and leaves the rest alone.
 *
 *   npm run deploy:rules              # deploy them
 *   npm run deploy:rules --dry-run    # check the checkout only
 *
 * Rules are the authorization boundary, so this refuses a stale checkout for
 * the same reason the functions deploy does: what is on this disk is what
 * becomes the live policy.
 */
const { spawnSync } = require('child_process');
const { requireCurrentCheckout } = require('./lib/require-current-checkout');

const dryRun = process.argv.includes('--dry-run');
const passthrough = process.argv.slice(2).filter((a) => a.startsWith('-') && a !== '--dry-run');

requireCurrentCheckout('this rules deploy', 'npm run deploy:rules', { shipPaths: ['firestore.rules', 'firestore.indexes.json'] });

console.log('\nRun `npm run test:rules` against the emulator first if the rules changed.\n');

if (dryRun) {
  console.log('--dry-run: checks passed, would deploy --only firestore:rules,firestore:indexes');
  process.exit(0);
}

console.log('Deploying --only firestore:rules,firestore:indexes\n');
const run = spawnSync('npx', ['firebase-tools@latest', 'deploy', '--only', 'firestore:rules,firestore:indexes', ...passthrough], {
  stdio: 'inherit',
});
process.exit(run.status == null ? 1 : run.status);
