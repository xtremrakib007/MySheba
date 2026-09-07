/**
 * Bumps app.json's Android versionCode (+1) and the version string's
 * last segment (+1), e.g. "5.3.0.1" -> "5.3.0.2".
 * Also syncs package.json's "version" field so they don't drift.
 *
 * Runs automatically before every build (see package.json "build:*"
 * scripts and eas-build-pre-install.sh for EAS cloud builds).
 */
const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '..', 'app.json');
const pkgJsonPath = path.join(__dirname, '..', 'package.json');

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

const oldVersionCode = appJson.expo.android.versionCode;
const newVersionCode = oldVersionCode + 1;
appJson.expo.android.versionCode = newVersionCode;

const oldVersion = appJson.expo.version;
const parts = oldVersion.split('.');
parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
const newVersion = parts.join('.');
appJson.expo.version = newVersion;

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

try {
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  pkgJson.version = newVersion;
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
} catch (e) {
  console.warn('Could not sync package.json version:', e.message);
}

console.log(`Version bumped: versionCode ${oldVersionCode} -> ${newVersionCode}, version ${oldVersion} -> ${newVersion}`);
