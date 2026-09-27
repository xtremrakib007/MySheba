#!/usr/bin/env node
/**
 * Build the Android app, refusing to build a stale or uncommitted checkout.
 *
 * `eas build` uploads THE LOCAL DIRECTORY, the same as `eas workflow:run`
 * and `firebase deploy`. A stale OTA showed old screens for a few minutes;
 * a stale store release is a versionCode burned on the wrong code, and Play
 * will never accept that number again.
 *
 * These scripts used to run bump-version as part of the build:
 *
 *     "build:aab": "npm run bump-version && eas build ..."
 *
 * which left the bump uncommitted - so the versionCode that shipped was
 * never in the repository. That is exactly the drift bump-version's own
 * header warns about ("Commit the bump and the committed value is what
 * shipped"). Bumping is now a separate, committed act:
 *
 *     node scripts/bump-version.js   # then commit it
 *     npm run build:aab
 */
const { spawnSync, execSync } = require('child_process');
const path = require('path');
const { requireCurrentCheckout } = require('./lib/require-current-checkout');

const profile = process.argv[2];
if (!profile) {
  console.error('\nUsage: node scripts/build-android.js <eas-profile>\n');
  process.exit(1);
}
const dryRun = process.argv.includes('--dry-run');

requireCurrentCheckout('this build', `npm run ${profile === 'production' ? 'build:aab' : 'build:apk'}`);

const app = require(path.join(__dirname, '..', 'app.base.json')).expo;
const shipping = `${app.version} (versionCode ${app.android.versionCode})`;

// The number Play checks comes from app.base.json because eas.json sets
// cli.appVersionSource to "local". Whatever is committed is what ships.
const alreadyUsed = (() => {
  try {
    return execSync(`git tag --list "v*${app.android.versionCode}"`, { encoding: 'utf8' }).trim();
  } catch (e) {
    return '';
  }
})();

console.log(`Shipping ${shipping} on profile "${profile}".`);
if (alreadyUsed) console.log(`Note: a tag already exists for this versionCode (${alreadyUsed}).`);
console.log('Play rejects a versionCode it has already seen, so bump and commit first if this one shipped.\n');

if (dryRun) {
  console.log(`--dry-run: checks passed, would build ${shipping}`);
  process.exit(0);
}

const run = spawnSync('npx', ['eas-cli@latest', 'build', '-p', 'android', '--profile', profile], {
  stdio: 'inherit',
});
process.exit(run.status == null ? 1 : run.status);
