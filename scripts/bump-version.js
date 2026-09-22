/**
 * Bumps the human-facing version string's last segment (+1),
 * e.g. "5.4.1.11" -> "5.4.1.12", in app.base.json and package.json.
 *
 * Deliberately does NOT touch android.versionCode. Since eas.json sets
 * cli.appVersionSource to "remote", EAS stores the versionCode on its own
 * servers and the production profile's autoIncrement bumps it per build -
 * the value in app.base.json only seeds that counter the very first time
 * and is ignored afterwards. Bumping it here would just recreate the drift
 * this setup exists to remove: the old eas-build-pre-install.sh bumped it
 * on the build server, where the change was thrown away with the ephemeral
 * checkout, so the committed value fell behind what shipped and the next
 * build re-used a versionCode the Play Console had already seen.
 *
 * Run this manually when you want a new marketing version - it is no
 * longer wired into the build scripts.
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

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

try {
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  pkgJson.version = newVersion;
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
} catch (e) {
  console.warn('Could not sync package.json version:', e.message);
}

console.log(`Version bumped: ${oldVersion} -> ${newVersion} (versionCode is managed remotely by EAS)`);
