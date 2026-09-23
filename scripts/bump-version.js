/**
 * Bumps both version numbers in app.base.json (and mirrors the marketing
 * version into package.json):
 *
 *   expo.version              "5.4.1.11" -> "5.4.1.12"   (what people see)
 *   expo.android.versionCode  45 -> 46                   (what Play checks)
 *
 * Both are needed because eas.json sets cli.appVersionSource to "local",
 * so EAS ships exactly the versionCode written here. There is no
 * autoIncrement on any profile.
 *
 * This file used to say the opposite - that appVersionSource was "remote"
 * and autoIncrement bumped versionCode per build, so bumping it here would
 * cause drift. That was true when it was written (cdd86c8), and stopped
 * being true one commit later: the "Merge audit fixes with latest main
 * features" merge (4eccc79) reverted eas.json to "local" and dropped
 * autoIncrement, but left this comment in place. The result was that
 * nothing incremented versionCode at all - it sat at 45 across every
 * build, and Play rejects a versionCode it has already seen.
 *
 * The drift that cdd86c8 was fighting came from running this script on the
 * EAS build server, where the bumped value died with the ephemeral
 * checkout. That is no longer the case: eas-build-pre-install.sh only
 * validates now, and build:apk / build:aab run this locally before
 * uploading. Commit the bump and the committed value is what shipped.
 */
const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '..', 'app.base.json');
const pkgJsonPath = path.join(__dirname, '..', 'package.json');

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

const oldVersion = appJson.expo.version;
const parts = oldVersion.split('.');
parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
const newVersion = parts.join('.');
appJson.expo.version = newVersion;

const oldCode = appJson.expo.android.versionCode;
if (!Number.isInteger(oldCode)) {
  throw new Error(`app.base.json expo.android.versionCode must be an integer, got ${JSON.stringify(oldCode)}`);
}
const newCode = oldCode + 1;
appJson.expo.android.versionCode = newCode;

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

try {
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  pkgJson.version = newVersion;
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
} catch (e) {
  console.warn('Could not sync package.json version:', e.message);
}

console.log(`Version  : ${oldVersion} -> ${newVersion}`);
console.log(`versionCode: ${oldCode} -> ${newCode}`);
console.log('Commit app.base.json and package.json so the shipped build is reproducible.');
