#!/usr/bin/env node
/**
 * Publish the production OTA, refusing to publish stale code.
 *
 * `eas workflow:run` without `--ref` uploads THE LOCAL DIRECTORY, not the
 * branch. That is easy to miss and it cost two published updates: the
 * checkout sat at bcbe5d5 while main had moved six merges ahead, so both
 * publishes shipped code from before the fixes they were meant to deliver,
 * and the app looked unchanged.
 *
 * `--ref main` is the obvious answer and does not work here: it needs the
 * Expo project linked to a GitHub repository, and this one is not -
 *   [GraphQL] No repository found for appId 5f0bbeb3-...
 * Until that link exists, the local tree IS what ships, so the only safe
 * thing is to check the tree before uploading it.
 *
 * Refuses unless HEAD equals origin/main and nothing is uncommitted.
 */
const { spawnSync } = require('child_process');
const { requireCurrentCheckout } = require('./lib/require-current-checkout');

requireCurrentCheckout('this publish', 'npm run publish:ota');

// --dry-run stops here, having proved the checks pass. It is how the happy
// path is tested without spending a publish.
if (process.argv.includes('--dry-run')) {
  console.log('--dry-run: checks passed, not publishing.');
  process.exit(0);
}

console.log('Publishing.\n');

const args = [
  'eas-cli@latest',
  'workflow:run',
  '.eas/workflows/publish-ota.yml',
  '--wait',
  ...process.argv.slice(2).filter((a) => a !== '--dry-run'),
];
const run = spawnSync('npx', args, { stdio: 'inherit' });
process.exit(run.status == null ? 1 : run.status);
