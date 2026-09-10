const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const failures = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

if (!exists('package-lock.json')) fail('package-lock.json is missing.');
if (!exists('functions/package-lock.json')) fail('functions/package-lock.json is missing.');
if (!exists('firestore.rules')) fail('firestore.rules is missing.');
if (!exists('storage.rules')) fail('storage.rules is missing.');

const functionsIndex = read('functions/index.js');
if (!functionsIndex.includes('setGlobalOptions')) fail('Cloud Functions global options are not configured.');
if (!functionsIndex.includes('enforceAppCheck: false')) fail('App Check enforcement must remain staged until the production client is verified.');
if (!functionsIndex.includes('maxInstances: 50')) fail('Cloud Functions maxInstances safety cap is missing.');

const entry = read('index.js');
if (entry.includes('TEMP DIAGNOSTIC') || entry.includes('// await displayIncomingCallNotification')) {
  fail('Incoming-call notification handling is still disabled.');
}
if (!entry.includes('displayIncomingCallNotification(data)')) {
  fail('Incoming-call notification handler is not wired.');
}

const packageJson = JSON.parse(read('package.json'));
if (!packageJson.scripts || !packageJson.scripts['build:aab']) fail('Production AAB build script is missing.');
if (!packageJson.scripts || !packageJson.scripts['audit:prod']) fail('Production dependency audit script is missing.');

const eas = JSON.parse(read('eas.json'));
if (eas?.build?.production?.environment !== 'production') fail('Production AAB profile must use the EAS production environment.');

// Syntax-check the backend JavaScript without executing Firebase services.
const files = [];
function walk(dir) {
  for (const entryName of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build'].includes(entryName.name)) continue;
    const full = path.join(dir, entryName.name);
    if (entryName.isDirectory()) walk(full);
    else if (entryName.isFile() && full.endsWith('.js')) files.push(full);
  }
}
walk(path.join(root, 'functions'));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(`JavaScript syntax error: ${path.relative(root, file)}\n${result.stderr.trim()}`);
}

if (failures.length) {
  console.error(`\nProduction readiness gate failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`Production readiness gate passed (${files.length} backend JavaScript files syntax-checked).`);
