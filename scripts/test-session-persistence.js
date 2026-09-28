#!/usr/bin/env node
/**
 * "I closed the app and it logged me out."
 *
 * That report was caused twice by the same one-line mistake, in two different
 * files, and the second copy survived the first fix because the fix was made
 * by reading the file rather than by grepping the tree:
 *
 *   functions/deviceSessionService.js     revoked when a known device logged in
 *   functions/deviceVerificationService.js  revoked when a new device passed its code
 *
 * admin.auth().revokeRefreshTokens(uid) sets tokensValidAfterTime to now, which
 * kills every refresh token issued before that instant - including the one the
 * calling device was handed by signInWithPassword moments earlier. The API is
 * all or nothing; a session-establishing function cannot use it without ending
 * the session it is establishing. The damage is invisible for up to an hour,
 * because the ID token already in memory keeps working, and then shows up as a
 * logout on the next cold start.
 *
 * So the rule this asserts: a callable that hands out a session must not revoke
 * tokens, and only the callables whose actual purpose is revocation may.
 *
 * Run: npm run test:session
 */
const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = path.join(__dirname, '..', 'functions');

// Callables whose whole point is to end a session. Revoking is correct here.
// Anything not on this list that revokes is a bug until someone justifies it
// by adding it here, deliberately.
const MAY_REVOKE = new Set([
  'revokeTrustedDevice',  // the person asked for that device to be kicked
  'adminForceLogout',     // a superadmin is terminating someone's session
  'manageUser',           // suspension must not leave a usable refresh token
  'resetPassword',        // a reset invalidates sessions opened with the old one
  'startAccountMerge',    // the merged-away account must stop being usable
  'confirmAccountMerge',
]);

// Callables that establish or restore a session. These are the login path, and
// a revoke inside any of them is the bug above. Named explicitly so that a
// rename or a delete is loud rather than silently reducing coverage.
const MUST_NOT_REVOKE = [
  ['deviceSessionService.js', 'checkDeviceSession'],
  ['deviceSessionService.js', 'confirmDeviceSwitch'],
  ['deviceSessionService.js', 'clearActiveSession'],
  ['deviceVerificationService.js', 'sendDeviceVerification'],
  ['deviceVerificationService.js', 'confirmDeviceEmailOtp'],
];

const failures = [];
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(name + (detail ? '  (' + detail + ')' : ''));
}

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return jsFiles(full);
    return e.name.endsWith('.js') ? [full] : [];
  });
}

/** Strip // line comments and block comments so a comment ABOUT the bug - the
 *  explanation left where the call used to be - is not read as the bug. */
function stripComments(src) {
  let out = '';
  let i = 0;
  let mode = 'code';
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (mode === 'code') {
      if (two === '//') { mode = 'line'; out += '  '; i += 2; continue; }
      if (two === '/*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (src[i] === "'" || src[i] === '"' || src[i] === '`') { mode = src[i]; out += src[i]; i++; continue; }
      out += src[i]; i++; continue;
    }
    if (mode === 'line') {
      if (src[i] === '\n') { mode = 'code'; out += '\n'; i++; continue; }
      out += ' '; i++; continue;
    }
    if (mode === 'block') {
      if (two === '*/') { mode = 'code'; out += '  '; i += 2; continue; }
      out += src[i] === '\n' ? '\n' : ' '; i++; continue;
    }
    // inside a string literal
    if (src[i] === '\\') { out += '  '; i += 2; continue; }
    if (src[i] === mode) { mode = 'code'; out += src[i]; i++; continue; }
    out += src[i]; i++;
  }
  return out;
}

/** The name of the last `exports.NAME = ` at or before `index`. */
function enclosingExport(code, index) {
  const re = /exports\.([A-Za-z0-9_$]+)\s*=/g;
  let name = '(top level)';
  let m;
  while ((m = re.exec(code)) && m.index <= index) name = m[1];
  return name;
}

const files = jsFiles(FUNCTIONS_DIR);
check('functions/ has source files to scan', files.length > 0, files.length + ' files');

// --- 1. every revoke site sits in a callable that is allowed to revoke ------
const sites = [];
for (const file of files) {
  const rel = path.relative(path.join(__dirname, '..'), file);
  const code = stripComments(fs.readFileSync(file, 'utf8'));
  const re = /revokeRefreshTokens\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    const line = code.slice(0, m.index).split('\n').length;
    sites.push({ rel, line, owner: enclosingExport(code, m.index) });
  }
}

for (const s of sites) {
  check(
    'revoke in ' + s.owner + ' (' + s.rel + ':' + s.line + ') is deliberate',
    MAY_REVOKE.has(s.owner),
    MAY_REVOKE.has(s.owner)
      ? 'allowlisted'
      : s.owner + ' is not in MAY_REVOKE - if it hands out a session this kills it',
  );
}

// --- 2. the login-path callables contain no revoke at all ------------------
for (const [fileName, exportName] of MUST_NOT_REVOKE) {
  const full = path.join(FUNCTIONS_DIR, fileName);
  if (!fs.existsSync(full)) {
    check('functions/' + fileName + ' exists', false, 'file missing - coverage lost');
    continue;
  }
  const code = stripComments(fs.readFileSync(full, 'utf8'));
  const defined = new RegExp('exports\\.' + exportName + '\\s*=').test(code);
  check('functions/' + fileName + ' still defines ' + exportName, defined,
    defined ? '' : 'renamed or removed - update MUST_NOT_REVOKE');
  const owned = sites.filter(s => s.rel.endsWith(fileName) && s.owner === exportName);
  check(exportName + ' does not revoke refresh tokens', owned.length === 0,
    owned.length ? 'revokes at line ' + owned.map(s => s.line).join(', ') : '');
}

// --- 3. the client never signs out just because the app restarted ----------
// profileGate.shouldEndSessionForDevice is the client half: it must require a
// different DEVICE, not merely a different session id, or a routine session
// refresh reads as a takeover and the app signs itself out on launch.
const gatePath = path.join(__dirname, '..', 'src', 'utils', 'profileGate.js');
const gate = fs.existsSync(gatePath) ? fs.readFileSync(gatePath, 'utf8') : '';
check('src/utils/profileGate.js exists', !!gate);
if (gate) {
  const { shouldEndSessionForDevice } = require(gatePath);
  check('shouldEndSessionForDevice is exported', typeof shouldEndSessionForDevice === 'function');
  if (typeof shouldEndSessionForDevice === 'function') {
    // A cold start on the SAME device whose session id was refreshed server
    // side. This must not end the session - it is the exact false positive.
    check('same device with a refreshed session id stays signed in',
      shouldEndSessionForDevice({
        localSessionId: 'old-session', activeSessionId: 'new-session',
        activeDeviceId: 'device-A', deviceId: 'device-A',
        initialRouteDone: true, deviceCheckDeferred: false,
      }) === false);
    // A genuine takeover: another device now holds the active session.
    check('a different device taking over does sign this one out',
      shouldEndSessionForDevice({
        localSessionId: 'old-session', activeSessionId: 'new-session',
        activeDeviceId: 'device-B', deviceId: 'device-A',
        initialRouteDone: true, deviceCheckDeferred: false,
      }) === true);
    // A login that could not reach checkDeviceSession never got an
    // authoritative session id, so a mismatch proves nothing.
    check('a deferred device check never signs anyone out',
      shouldEndSessionForDevice({
        localSessionId: 'stale', activeSessionId: 'new-session',
        activeDeviceId: 'device-B', deviceId: 'device-A',
        initialRouteDone: true, deviceCheckDeferred: true,
      }) === false);
    // Bootstrap must never destroy a persisted login.
    check('bootstrap does not sign anyone out',
      shouldEndSessionForDevice({
        localSessionId: 'stale', activeSessionId: 'new-session',
        activeDeviceId: 'device-B', deviceId: 'device-A',
        initialRouteDone: false, deviceCheckDeferred: false,
      }) === false);
  }
}

for (const c of checks) {
  console.log((c.ok ? 'ok   ' : 'FAIL ') + c.name + (c.detail ? '  - ' + c.detail : ''));
}
console.log('');
if (failures.length) {
  console.error(failures.length + ' failure(s).');
  process.exit(1);
}
console.log('Session persistence: all ' + checks.length + ' checks pass.');
