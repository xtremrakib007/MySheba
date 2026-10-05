#!/usr/bin/env node
/**
 * Build and deploy the admin site, from what is on origin/main.
 *
 * The other three ways this project ships all refuse a stale checkout. This
 * one did not exist, so the admin site was deployed by hand:
 *
 *   cd admin-web && npm run build && firebase deploy --only hosting
 *
 * which has three problems, and all three have now happened. It builds
 * whatever is on the disk, so a checkout a commit behind ships a bundle
 * missing the change it was meant to deliver - and unlike the guarded
 * commands, it says nothing. It runs from admin-web/, where a second
 * firebase.json has one untargeted site, so `--only hosting:admin-web` is
 * rejected there ("not detected in firebase.json") and the bare `--only
 * hosting` that works instead names no target at all. And a build that fails
 * still leaves the last dist/ in place, so the deploy that follows uploads a
 * stale one.
 *
 * So: check, build, then deploy from the repo root with the target named.
 * `hosting:admin-web` resolves through .firebaserc to the satulink-solutions
 * site; the marketing site is the separate `myshebas` target and is never
 * touched by this.
 *
 *   npm run deploy:web              # build and deploy
 *   npm run deploy:web --dry-run    # check and build only
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { requireCurrentCheckout } = require('./lib/require-current-checkout');

const ROOT = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const passthrough = process.argv.slice(2).filter((a) => a.startsWith('-') && a !== '--dry-run');

// The site is built from admin-web/, and from the shared Firebase config it
// points at - a change to either reaches production.
requireCurrentCheckout('this admin site deploy', 'npm run deploy:web', {
  shipPaths: ['admin-web', 'firebase.json', '.firebaserc'],
});

console.log('\nBuilding the admin site\n');
const build = spawnSync('npm', ['run', 'build'], { cwd: path.join(ROOT, 'admin-web'), stdio: 'inherit' });
if (build.status !== 0) {
  // Stopping here matters: dist/ still holds the last successful build, so
  // carrying on would upload it and report success.
  console.error('\nThe build failed, so nothing was deployed. The site is unchanged.\n');
  process.exit(build.status == null ? 1 : build.status);
}

if (dryRun) {
  console.log('\n--dry-run: checks passed and the site built, would deploy --only hosting:admin-web\n');
  process.exit(0);
}

console.log('\nDeploying --only hosting:admin-web\n');
const run = spawnSync('npx', ['firebase-tools@latest', 'deploy', '--only', 'hosting:admin-web', ...passthrough], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.exit(run.status == null ? 1 : run.status);
