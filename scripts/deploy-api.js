#!/usr/bin/env node
/**
 * Deploy every function that carries the API-provider code.
 *
 * A partial deploy updates only the functions it names. Everything else keeps
 * serving the bundle it was last deployed with, so fixing apiProviderService.js
 * and deploying saveApiProvider alone leaves the charge path - the code that
 * actually dispatches a recharge - running the old copy. The fix looks shipped
 * and the bug is still live.
 *
 * So the list is derived, not typed. Any function whose module closure reaches
 * apiProviderService, apiWebhookService or successTopupPoller is included, and
 * a new callable in any of them joins automatically. A hand-kept list had
 * already drifted: it carried transferPoints, which is secureTransfer and does
 * not touch the API at all, and omitted the charge* callables, which are the
 * ones that matter most.
 *
 *   npm run deploy:api             # deploy them
 *   npm run deploy:api --dry-run   # list them, deploy nothing
 */
const { spawnSync } = require('child_process');
const { requireCurrentCheckout } = require('./lib/require-current-checkout');
const { functionsDependingOn, assertDeployable } = require('./lib/exported-functions');

// successTopupPoller is seeded explicitly: it reconciles the same provider's
// transactions but reaches it through providerSecretService, so no dependency
// edge would ever pull it in.
const SEEDS = ['apiProviderService', 'apiWebhookService', 'successTopupPoller'];

const dryRun = process.argv.includes('--dry-run');
const passthrough = process.argv.slice(2).filter((a) => a.startsWith('-') && a !== '--dry-run');

const names = functionsDependingOn(SEEDS);
if (!names.length) {
  console.error('No functions matched. functions/index.js may have moved or changed shape.');
  process.exit(1);
}
assertDeployable(names);

console.log(`\n${names.length} functions carry the API provider code:\n`);
for (const n of names) console.log(`  ${n}`);
console.log();

requireCurrentCheckout('this deploy', 'npm run deploy:api', { shipPaths: ['functions'] });

const target = names.map((n) => `functions:${n}`).join(',');
if (dryRun) {
  console.log(`--dry-run: checks passed, would deploy --only ${target}`);
  process.exit(0);
}

console.log('Deploying...\n');
const run = spawnSync('npx', ['firebase-tools@latest', 'deploy', '--only', target, ...passthrough], {
  stdio: 'inherit',
});
process.exit(run.status == null ? 1 : run.status);
