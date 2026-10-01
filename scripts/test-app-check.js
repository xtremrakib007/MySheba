#!/usr/bin/env node
'use strict';

/**
 * App Check must stay switchable, and the bridge must actually mint tokens.
 *
 * This branch enforced App Check on 95 callables. Three things made that
 * dangerous, and each is pinned here because each is silent:
 *
 *   1. "One switch" was not true. 57 of the 95 hardcoded
 *      `enforceAppCheck: true` instead of reading ENFORCE_APP_CHECK, so
 *      setting the constant to false would still have left enforcement hard-on
 *      for chargeGuards (every purchase), deviceVerificationService (sign-in),
 *      secureTransfer, secureWalletCharge, rechargePinService,
 *      adminTopUpService and 51 others.
 *
 *   2. The native -> JS bridge dropped the token expiry.
 *      @react-native-firebase/app-check's getToken() resolves to
 *      AppCheckTokenResult, which declares only `token`; expireTimeMillis is on
 *      a different interface and is populated natively only on onTokenChanged.
 *      @firebase/app-check caches with
 *      `isValid = token.expireTimeMillis - Date.now() > 0`, and
 *      `undefined - now` is NaN, so the cache never hit and every callable
 *      invocation fired a fresh Play Integrity attestation.
 *
 *   3. A debug token on the production profile silently downgraded a
 *      production build to the debug provider, which verifies anything holding
 *      that one registered token.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const failures = [];
let checks = 0;

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { failures.push(`${rel} is missing.`); return null; }
  return fs.readFileSync(p, 'utf8');
};
const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

function check(name, fn) {
  checks += 1;
  try { const problem = fn(); if (problem) failures.push(`${name}: ${problem}`); }
  catch (err) { failures.push(`${name}: check threw - ${err.message}`); }
}

// ---------------------------------------------------- one switch, really ----

check('no callable hardcodes App Check enforcement', () => {
  const dir = path.join(ROOT, 'functions');
  const offenders = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.js')) continue;
    const body = code(fs.readFileSync(path.join(dir, name), 'utf8'));
    const hits = (body.match(/enforceAppCheck:\s*true/g) || []).length;
    if (hits) offenders.push(`${name} (${hits})`);
  }
  return offenders.length
    ? `${offenders.join(', ')} hardcode enforceAppCheck: true. Use ENFORCE_APP_CHECK from ./appCheckPolicy, `
      + 'or turning enforcement off cannot turn it off for these.'
    : null;
});

check('every file using the switch imports it', () => {
  const dir = path.join(ROOT, 'functions');
  const missing = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.js')) continue;
    const body = code(fs.readFileSync(path.join(dir, name), 'utf8'));
    if (!/enforceAppCheck:\s*ENFORCE_APP_CHECK/.test(body)) continue;
    if (!/require\(['"]\.\/appCheckPolicy['"]\)/.test(body)) missing.push(name);
  }
  return missing.length
    ? `${missing.join(', ')} reference ENFORCE_APP_CHECK without requiring ./appCheckPolicy - a ReferenceError at deploy time.`
    : null;
});

check('enforcement is off until a build with the native module ships', () => {
  const src = read('functions/appCheckPolicy.js');
  if (!src) return 'unreadable';
  const m = /const\s+ENFORCE_APP_CHECK\s*=\s*(true|false)\s*;/.exec(code(src));
  if (!m) return 'ENFORCE_APP_CHECK is no longer a plain boolean constant.';
  if (m[1] !== 'false') {
    return 'ENFORCE_APP_CHECK is true. Turn it on only once a release carrying '
      + '@react-native-firebase/app-check is adopted and the Firebase console shows verified requests '
      + 'from real installs - otherwise every callable returns unauthenticated for everyone, which is '
      + 'what happened for ten days in September.';
  }
  return null;
});

// --------------------------------------------------------- the bridge ------

function loadBridge() {
  const src = read('src/firebase/appCheckBridge.js');
  if (!src) throw new Error('src/firebase/appCheckBridge.js is missing');
  const stripped = src.replace(/^import [^\n]*$/gm, '').replace(/^export /gm, '');
  const mod = {};
  new Function('module', 'Constants', 'process',
    `${stripped}\nmodule.exports={toAppCheckToken,expiryFromJwt,shouldUseDebugProvider};`
  )(mod, { expoConfig: { extra: {} } }, { env: {} });
  return mod.exports;
}

check('the bridge always supplies a usable token expiry', () => {
  const { toAppCheckToken } = loadBridge();
  const now = 1760000000000;
  const jwt = (expSeconds) => `h.${Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url')}.s`;
  // This is how @firebase/app-check decides whether its cached token is usable.
  const isValid = (t) => t.expireTimeMillis - now > 0;

  // The real shape of a getToken() result: token only.
  const fromNative = toAppCheckToken({ token: jwt(now / 1000 + 3600) }, now);
  if (!Number.isFinite(fromNative.expireTimeMillis)) {
    return 'expireTimeMillis is not a finite number, so @firebase/app-check computes NaN and never caches - '
      + 'every callable call would trigger a fresh Play Integrity attestation.';
  }
  if (!isValid(fromNative)) return 'the bridged token is immediately invalid, so the cache can never hit.';

  // Unparseable token must still cache, not fall back to undefined.
  const opaque = toAppCheckToken({ token: 'not-a-jwt' }, now);
  if (!isValid(opaque)) return 'a token whose expiry cannot be parsed gets no fallback TTL.';

  // An expiry the native side DOES provide must win.
  const declared = toAppCheckToken({ token: jwt(now / 1000 + 3600), expireTimeMillis: now + 900000 }, now);
  if (declared.expireTimeMillis !== now + 900000) return 'a native-supplied expireTimeMillis is ignored.';

  // An empty token is a failure, not a token with a made-up expiry.
  let threw = false;
  try { toAppCheckToken({ token: '' }, now); } catch (e) { threw = true; }
  if (!threw) return 'an empty native token is passed through instead of failing.';
  return null;
});

check('a debug token cannot downgrade a production build', () => {
  const { shouldUseDebugProvider } = loadBridge();
  if (shouldUseDebugProvider({ isDev: false, debugToken: 'tok', profile: 'production' })) {
    return 'a debug token on the production profile selects the debug provider. App Check would then verify '
      + 'anything holding that one registered token.';
  }
  if (!shouldUseDebugProvider({ isDev: true, debugToken: '', profile: 'production' })) {
    return 'development builds no longer use the debug provider, so they cannot attest at all.';
  }
  if (!shouldUseDebugProvider({ isDev: false, debugToken: 'tok', profile: 'preview' })) {
    return 'a preview build with a registered debug token cannot use it.';
  }
  if (shouldUseDebugProvider({ isDev: false, debugToken: '', profile: 'preview' })) {
    return 'a build with no debug token still selects the debug provider.';
  }
  return null;
});

check('an App Check failure is visible, not silent', () => {
  const src = read('src/firebase/config.js');
  if (!src) return 'unreadable';
  const body = code(src);
  if (!/isAppCheckReady/.test(body)) return 'config.js exposes no way to tell whether App Check can mint a token.';
  const catchAt = body.indexOf('catch');
  const after = body.slice(catchAt, catchAt + 600);
  if (/if\s*\(\s*__DEV__\s*\)\s*console\.warn/.test(after)) {
    return 'the initialization failure is logged only in __DEV__. In a release build that makes a device '
      + 'that cannot attest indistinguishable from one that can, and once enforcement is on every callable '
      + 'returns unauthenticated with nothing to explain why.';
  }
  if (!/console\.warn|console\.error/.test(after)) return 'the initialization failure is swallowed entirely.';
  return null;
});

if (failures.length) {
  console.error('App Check posture FAILED:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\n${failures.length} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`App Check posture: ${checks} checks passed.`);
