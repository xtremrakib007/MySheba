#!/usr/bin/env node
/**
 * When a profile read is allowed to end a session.
 *
 * Exercises the functions AppContext actually calls, so these are the
 * shipping decisions rather than a restatement of them. The bug they exist
 * to prevent: a failed Firestore read set profile to null, the hard auth
 * boundary saw no profile and routed to Login, and a person with a
 * perfectly valid persisted Firebase session was told to log in again.
 */
const esbuild = require('esbuild');
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const code = esbuild.transformSync(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'profileGate.js'), 'utf8'),
  { loader: 'js', format: 'cjs' }).code;
const box = { module: { exports: {} }, exports: {} };
box.module.exports = box.exports; vm.createContext(box); vm.runInContext(code, box);
const { classifyProfileError, classifyProfileSnapshot, shouldEndSessionForDevice } = box.module.exports;

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : `  (got ${got}, want ${want})`}`);
};

console.log('\n-- a failed read must not sign anyone out --');
is('no network (unavailable) -> stay signed in',
   classifyProfileError({ code: 'unavailable' }), 'transient');
is('deadline-exceeded -> stay signed in',
   classifyProfileError({ code: 'deadline-exceeded' }), 'transient');
is('listener dropped, no code -> stay signed in',
   classifyProfileError({}), 'transient');
is('internal -> stay signed in',
   classifyProfileError({ code: 'internal' }), 'transient');
is('unauthenticated -> stay signed in (Auth owns that call)',
   classifyProfileError({ code: 'unauthenticated' }), 'transient');

console.log('\n-- only a definite refusal ends it, and only after a retry --');
is('permission-denied first time -> retry, do not sign out',
   classifyProfileError({ code: 'permission-denied' }, { isRetry: false }), 'retry');
is('permission-denied again -> account really is blocked',
   classifyProfileError({ code: 'permission-denied' }, { isRetry: true }), 'fatal');
is('a transient error on the retry still does not sign out',
   classifyProfileError({ code: 'unavailable' }, { isRetry: true }), 'transient');

console.log('\n-- a missing document --');
is('missing, served from local cache -> not cached yet, ignore',
   classifyProfileSnapshot(null, { fromCache: true }), 'ignore');
is('missing, served from server -> account really is gone',
   classifyProfileSnapshot(null, { fromCache: false }), 'gone');
is('missing, no metadata at all -> treated as a server answer',
   classifyProfileSnapshot(null, undefined), 'gone');
is('present from cache -> use it (this is the offline launch)',
   classifyProfileSnapshot({ role: 'customer' }, { fromCache: true }), 'ok');
is('present from server -> use it',
   classifyProfileSnapshot({ role: 'customer' }, { fromCache: false }), 'ok');

console.log('\n-- single-device rule: fires when it should, never when it should not --');
is('another device took over while running -> sign out (feature kept)',
   shouldEndSessionForDevice({ localSessionId: 'a', activeSessionId: 'b', initialRouteDone: true, deviceCheckDeferred: false }), true);
is('same session -> no',
   shouldEndSessionForDevice({ localSessionId: 'a', activeSessionId: 'a', initialRouteDone: true, deviceCheckDeferred: false }), false);
is('mismatch during first route after launch -> no',
   shouldEndSessionForDevice({ localSessionId: 'a', activeSessionId: 'b', initialRouteDone: false, deviceCheckDeferred: false }), false);
is('mismatch but device check was deferred -> no (stale id, we never asked)',
   shouldEndSessionForDevice({ localSessionId: 'a', activeSessionId: 'b', initialRouteDone: true, deviceCheckDeferred: true }), false);
is('no local id -> nothing to compare',
   shouldEndSessionForDevice({ localSessionId: null, activeSessionId: 'b', initialRouteDone: true, deviceCheckDeferred: false }), false);
is('no active id on the profile -> nothing to compare',
   shouldEndSessionForDevice({ localSessionId: 'a', activeSessionId: null, initialRouteDone: true, deviceCheckDeferred: false }), false);
is('called with nothing -> no',
   shouldEndSessionForDevice(), false);

console.log('\n-- the splash must never be able to hang --');
// Structural, not behavioural: the watchdog lives inside a React effect and
// cannot be imported. What is checked is that it still exists and is still
// wired, because several paths out of the profile listener legitimately
// return without routing (a document missing from the local cache is
// ignored so the server can answer) and offline there may be no server
// answer and no cached profile either - which would hold the splash at 92%
// forever.
const ctx = fs.readFileSync(path.join(__dirname, '..', 'src', 'context', 'AppContext.js'), 'utf8');
is('a first-route watchdog is defined', /const armFirstRouteWatchdog = \(\) => \{/.test(ctx), true);
is('it is armed when a signed-in user appears',
   /if \(user && !initialRouteDone\) armFirstRouteWatchdog\(\);/.test(ctx), true);
is('it clears authLoading when it fires',
   /firstRouteWatchdog = setTimeout\([\s\S]{0,220}setAuthLoading\(false\)/.test(ctx), true);
is('it is cleared on teardown',
   /cancelled = true;[\s\S]{0,160}clearTimeout\(firstRouteWatchdog\)/.test(ctx), true);

console.log('\n-- App Lock must actually lock --');
// It did not. appLocked was declared, read by AppLockScreen and set to
// false in two places, but setAppLocked(true) existed nowhere in the app,
// and there was no AppState listener in AppContext at all - so the Settings
// toggle did nothing and reopening the app never asked for anything.
is('something sets appLocked true', /setAppLocked\(true\)/.test(ctx), true);
is('a restored session locks on cold launch',
   /launchLockDoneRef\.current \|\| signedInThisSessionRef\.current[\s\S]{0,120}setAppLocked\(true\)/.test(ctx), true);
is('an AppState listener exists to re-lock on return',
   /AppState\.addEventListener\(\s*["']change["']/.test(ctx), true);
is('the grace period is honoured before re-locking',
   /APP_LOCK_GRACE_MS\) return;[\s\S]{0,500}setAppLocked\(true\)/.test(ctx), true);
is('a sign-in performed just now skips the launch lock',
   /signedInThisSessionRef\.current = true;/.test(ctx), true);
is('locking never signs anyone out',
   /setAppLocked\(true\);?[\s\S]{0,40}\}\);/.test(ctx) && !/setAppLocked\(true\)[^\n]{0,80}logout/.test(ctx), true);

console.log('\n-- App Lock: the pref is per account and must actually persist --');
// It silently broke three ways at once: setAppLocked(true) existed nowhere,
// and getAppLockEnabled/setAppLockEnabledPref both take a uid that the
// context was not passing - so the pref read false on every launch and the
// toggle saved nothing.
is('the stored pref is read for the signed-in account',
   /getAppLockEnabled\(uid\)\.then\(setAppLockEnabledState\)/.test(ctx), true);
is('it is re-read when the account changes, not once on mount',
   /\}, \[authUser\?\.uid\]\);/.test(ctx), true);
is('the toggle saves against that account',
   /setAppLockEnabledPref\(authUser\?\.uid, value\)/.test(ctx), true);

const prefs = fs.readFileSync(path.join(__dirname, '..', 'src', 'firebase', 'appLockPrefs.js'), 'utf8');
is('an account that never chose gets App Lock on',
   /export const DEFAULT_APP_LOCK_ENABLED = true;/.test(prefs), true);
is('   and that default is what an unset pref returns',
   /if \(legacy === null\) return DEFAULT_APP_LOCK_ENABLED;/.test(prefs), true);

console.log('\n-- but never lock an account that cannot unlock --');
is('locking requires a security PIN on the profile',
   /const canUnlock = !!profile\?\.securityPinSet;/.test(ctx), true);
is('the launch lock honours it',
   /if \(!authUser \|\| !appLockEnabled \|\| !canUnlock\) return;/.test(ctx), true);
is('the return-from-background lock honours it too',
   /appLockEnabledRef\.current && authUserRef\.current && canUnlockRef\.current/.test(ctx), true);

console.log('\n-- a signed-in person must never be stranded on Login --');
// The watchdog clears authLoading after 8s with no profile, the hard auth
// boundary then routes to Login, and the profile arriving afterwards used
// to skip routing because initialRouteDone was already true. The result was
// a login form in front of someone with a perfectly good session, which is
// what "closed the app and it logged me out" actually was.
is('a late profile still routes when stuck on login',
   /else if \(screenRef\.current === "login"\)[\s\S]{0,900}routeForRole\(p\)/.test(ctx), true);
is('it reads the screen through a ref, not a stale closure',
   /const screenRef = useRef\(null\);\s*\n\s*screenRef\.current = screen;/.test(ctx), true);

console.log('\n-- Remember Me must survive the sign-in that unmounts the screen --');
const login = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'LoginScreen.js'), 'utf8');
is('the debounced value is held where a flush can find it',
   /pendingWrite\.current = value;/.test(login), true);
is('an unmount flushes it instead of dropping it',
   /useEffect\(\(\) => \(\) => \{[\s\S]{0,300}setItem\(REMEMBER_KEY, value\)/.test(login), true);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
