#!/usr/bin/env node
/**
 * Deploy Cloud Functions, refusing to deploy a stale checkout.
 *
 * `firebase deploy` uploads firebase.json's "source": "functions" - the
 * local folder, not a branch. So deploying without pulling first puts
 * whatever is on this disk into production, which for a checkout that is
 * behind main means quietly reinstating the bug that was just fixed.
 *
 *   npm run deploy:functions                       # everything
 *   npm run deploy:functions checkDeviceSession    # just one
 */
const { spawnSync } = require('child_process');
const { requireCurrentCheckout } = require('./lib/require-current-checkout');

const names = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const passthrough = process.argv.slice(2).filter((a) => a.startsWith('-') && a !== '--dry-run');
const dryRun = process.argv.includes('--dry-run');

const target = names.length
  ? names.map((n) => `functions:${n}`).join(',')
  : 'functions';

requireCurrentCheckout('this deploy', `npm run deploy:functions${names.length ? ` ${names.join(' ')}` : ''}`);

if (dryRun) {
  console.log(`--dry-run: checks passed, would deploy --only ${target}`);
  process.exit(0);
}

console.log(`Deploying --only ${target}\n`);

// npx so it works on a machine with no global firebase-tools, which is the
// case on the phone this is usually run from ("No command firebase found").
const run = spawnSync('npx', ['firebase-tools@latest', 'deploy', '--only', target, ...passthrough], {
  stdio: 'inherit',
});
process.exit(run.status == null ? 1 : run.status);
