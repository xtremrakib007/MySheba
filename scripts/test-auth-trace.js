#!/usr/bin/env node
/**
 * The login screen's "Last sign-out" line has to tell three cases apart:
 *
 *   manual-logout    the person tapped Log Out
 *   device-takeover  the app signed itself out over a session mismatch
 *   firebase-no-user Firebase Auth dropped the user on its own (a dead
 *                    refresh token - the server-side cause)
 *
 * It could not. Every sign-out reached the auth listener, which recorded
 * 'firebase-no-user' over whatever specific reason had just been written to
 * the same key. So all three read as "firebase-no-user - while running", and
 * a whole round of debugging was spent on a line that could only ever say one
 * thing.
 *
 * Run: npm run test:trace
 */
const Module = require('module');
const path = require('path');

// Stand-in for AsyncStorage. The real one is a native module.
const store = new Map();
const AsyncStorageStub = {
  async getItem(k) { return store.has(k) ? store.get(k) : null; },
  async setItem(k, v) { store.set(k, v); },
  async removeItem(k) { store.delete(k); },
};

const realResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === '@react-native-async-storage/async-storage') return 'async-storage-stub';
  return realResolve.call(this, request, ...rest);
};
require.cache['async-storage-stub'] = {
  id: 'async-storage-stub', filename: 'async-storage-stub', loaded: true,
  exports: { __esModule: true, default: AsyncStorageStub },
};

const tracePath = path.join(__dirname, '..', 'src', 'utils', 'authTrace.js');
const src = require('fs').readFileSync(tracePath, 'utf8');
// Transpile the two ESM bits this file uses, so it can run under plain node.
const cjs = src
  .replace(/^import AsyncStorage from '[^']+';$/m,
    "const AsyncStorage = require('@react-native-async-storage/async-storage').default;")
  .replace(/^export async function /gm, 'async function ')
  .replace(/^export function /gm, 'function ')
  + '\nmodule.exports = { noteSignOut, peekSignOutTrace, flushSignOutTrace };';
const m = new Module(tracePath, null);
m.filename = tracePath;
m.paths = Module._nodeModulePaths(path.dirname(tracePath));
m._compile(cjs, tracePath);
const { noteSignOut, peekSignOutTrace } = m.exports;

const failures = [];
const checks = [];
async function check(name, fn, expected) {
  store.clear();
  await fn();
  const got = (await peekSignOutTrace())?.reason ?? null;
  const ok = got === expected;
  checks.push({ name, ok, detail: 'expected ' + expected + ', got ' + got });
  if (!ok) failures.push(name);
}

(async () => {
  // 1. The person tapped Log Out. authService.logout() records it, then
  //    signOut() makes the listener fire with no user.
  await check('a deliberate logout reads as manual-logout', async () => {
    await noteSignOut('manual-logout', 'logout() was called', { generic: true });
    await noteSignOut('firebase-no-user', 'while running', { generic: true });
  }, 'manual-logout');

  // 2. A takeover. The specific reason is written, then logout() runs (which
  //    records manual-logout), then the listener fires. Two generic writes
  //    follow the specific one and neither may win.
  await check('a device takeover survives both later writes', async () => {
    await noteSignOut('device-takeover', 'local=a active=b');
    await noteSignOut('manual-logout', 'logout() was called', { generic: true });
    await noteSignOut('firebase-no-user', 'while running', { generic: true });
  }, 'device-takeover');

  // 3. The token died. Nothing else wrote, so the generic reason stands - and
  //    now it MEANS something, because the other two cases no longer produce it.
  await check('an unexplained sign-out still reads as firebase-no-user', async () => {
    await noteSignOut('firebase-no-user', 'while running', { generic: true });
  }, 'firebase-no-user');

  // 4. A profile-gone sign-out does not call logout(), but the listener still
  //    fires afterwards.
  await check('profile-gone is not overwritten', async () => {
    await noteSignOut('profile-gone', 'users/x does not exist');
    await noteSignOut('firebase-no-user', 'at launch', { generic: true });
  }, 'profile-gone');

  // 5. An OLD breadcrumb must not suppress a new generic one. Someone logs out
  //    on Monday, and on Tuesday their token dies - Tuesday is what matters.
  await check('a stale breadcrumb does not mask a later sign-out', async () => {
    store.set('authTrace:lastSignOut:v1', JSON.stringify({
      reason: 'manual-logout', detail: 'old',
      at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    }));
    await noteSignOut('firebase-no-user', 'while running', { generic: true });
  }, 'firebase-no-user');

  // 6. A specific reason always wins, even over a recent specific one - two
  //    real causes in a row should show the latest.
  await check('a specific reason always overwrites', async () => {
    await noteSignOut('profile-gone', 'first');
    await noteSignOut('device-takeover', 'second');
  }, 'device-takeover');

  // 7. Corrupt stored JSON must not throw or swallow the new write.
  await check('a corrupt breadcrumb does not break recording', async () => {
    store.set('authTrace:lastSignOut:v1', '{not json');
    await noteSignOut('firebase-no-user', 'while running', { generic: true });
  }, 'firebase-no-user');

  for (const c of checks) console.log((c.ok ? 'ok   ' : 'FAIL ') + c.name + '  - ' + c.detail);
  console.log('');
  if (failures.length) { console.error(failures.length + ' failure(s).'); process.exit(1); }
  console.log('Auth trace: all ' + checks.length + ' checks pass.');
})();
