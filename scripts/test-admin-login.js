#!/usr/bin/env node
'use strict';

/**
 * The admin console's sign-in must behave like the app's.
 *
 * Three things went wrong here, and each is the kind that passes a happy-path
 * click-through and fails in production:
 *
 *   1. Google sign-in. Retired from the mobile runtime on purpose
 *      (src/firebase/authService.js keeps throwing stubs so stale callers fail
 *      cleanly), but the admin console still offered a working button.
 *
 *   2. checkDeviceSession being unreachable signed the admin out and showed
 *      "That account doesn't have admin access." The app's rule is the
 *      opposite and is written down: an answer of "no" blocks, no answer at
 *      all does not. The same mistake locked every user out of the app for
 *      ten days.
 *
 *   3. The console asked "is this browser trusted?" and then separately
 *      requested a code. Both are the same callable, and answering the first
 *      question SENDS a challenge - so two codes went out and only the second
 *      verified, which reads to the person as "the code doesn't work".
 *
 * Comments are stripped before scanning so the explanations above - and the
 * ones in the files themselves - cannot satisfy or trip a check.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const failures = [];
let checks = 0;

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`${rel} is missing.`);
    return null;
  }
  return fs.readFileSync(p, 'utf8');
}

/** Source with comments and string literals' contents removed. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

function check(name, fn) {
  checks += 1;
  try {
    const problem = fn();
    if (problem) failures.push(`${name}: ${problem}`);
  } catch (err) {
    failures.push(`${name}: check threw - ${err.message}`);
  }
}

// ---------------------------------------------------------------- Google ----

const GOOGLE_TOKENS = ['GoogleAuthProvider', 'signInWithPopup', 'signInWithRedirect', 'signInWithCredential'];

check('no Google sign-in anywhere in admin-web', () => {
  const dir = path.join(ROOT, 'admin-web', 'src');
  if (!fs.existsSync(dir)) return 'admin-web/src is missing.';
  const hits = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
      const body = code(fs.readFileSync(full, 'utf8'));
      for (const token of GOOGLE_TOKENS) {
        if (body.includes(token)) hits.push(`${path.relative(ROOT, full)} uses ${token}`);
      }
    }
  };
  walk(dir);
  return hits.length ? hits.join('; ') : null;
});

check('the app keeps Google sign-in as a throwing stub', () => {
  const src = read('src/firebase/authService.js');
  if (!src) return 'unreadable';
  const body = code(src);
  if (!/export\s+async\s+function\s+signInWithGoogle\s*\(\s*\)\s*\{\s*throw/.test(body)) {
    return 'signInWithGoogle in src/firebase/authService.js should be a stub whose body is a single throw. '
      + 'If Google sign-in is being brought back, that is a product decision, not a refactor.';
  }
  for (const token of GOOGLE_TOKENS) {
    if (body.includes(token)) return `src/firebase/authService.js uses ${token}; the mobile runtime has no Google credential flow.`;
  }
  return null;
});

// ------------------------------------------------- unreachable != denied ----

check('admin-web mirrors the app\'s unreachable-code list', () => {
  const appSrc = read('src/firebase/deviceSessionService.js');
  const webSrc = read('admin-web/src/services/deviceAuthService.ts');
  if (!appSrc || !webSrc) return 'unreadable';
  const listOf = (src, label) => {
    const m = /UNREACHABLE_CODES\s*=\s*\[([\s\S]*?)\]/.exec(src);
    if (!m) return { error: `${label} has no UNREACHABLE_CODES array.` };
    return { codes: [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]).sort() };
  };
  const app = listOf(appSrc, 'src/firebase/deviceSessionService.js');
  const web = listOf(webSrc, 'admin-web/src/services/deviceAuthService.ts');
  if (app.error) return app.error;
  if (web.error) return web.error;
  if (app.codes.join(',') !== web.codes.join(',')) {
    return `the two lists have drifted. app=[${app.codes.join(' ')}] admin-web=[${web.codes.join(' ')}]. `
      + 'A code treated as an outage on one surface and a rejection on the other locks people out of exactly one of them.';
  }
  if (!app.codes.includes('functions/unauthenticated')) {
    return "functions/unauthenticated must stay in the list: the callable framework returns it when the callable "
      + 'is misconfigured, and Firebase Auth accepted the credentials moments earlier.';
  }
  return null;
});

check('admin-web does not deny access when the device check is unreachable', () => {
  const src = read('admin-web/src/contexts/AuthContext.tsx');
  if (!src) return 'unreadable';
  const body = code(src);
  if (!body.includes('isDeviceCheckUnreachable')) {
    return 'AuthContext does not consult isDeviceCheckUnreachable, so any Cloud Functions hiccup becomes '
      + '"that account does not have admin access".';
  }
  // The unreachable branch runs from the guard to the end of the catch. It must
  // grant access, not revoke it. Anchor on the call, not the import above it.
  const guard = body.search(/if\s*\(\s*!\s*isDeviceCheckUnreachable\s*\(/);
  if (guard < 0) return 'no `if (!isDeviceCheckUnreachable(...))` guard on the sign-in path.';
  const branch = body.slice(guard, guard + 900);
  const deferredAt = branch.indexOf('setDeviceCheckDeferred');
  if (deferredAt < 0) return 'the unreachable branch does not flag the session as deferred.';
  const tail = branch.slice(deferredAt);
  const endOfBranch = tail.search(/\breturn\b/);
  const afterDeferred = endOfBranch < 0 ? tail : tail.slice(0, endOfBranch);
  if (!/setProfile\(\s*adminProfile\s*\)/.test(afterDeferred)) {
    return 'the unreachable branch does not admit the signed-in admin; an outage must not lock them out.';
  }
  if (/setAccessDenied\(\s*true\s*\)/.test(afterDeferred) || /firebaseSignOut/.test(afterDeferred)) {
    return 'the unreachable branch still denies access or signs out.';
  }
  return null;
});

// --------------------------------------------------- one challenge, once ----

check('sign-in sends exactly one email challenge', () => {
  const src = read('admin-web/src/contexts/AuthContext.tsx');
  if (!src) return 'unreadable';
  const body = code(src);
  const starts = (body.match(/startDeviceSession\s*\(/g) || []).length;
  if (starts !== 1) return `startDeviceSession is called ${starts} times on the sign-in path; it must be exactly 1.`;

  const resendAt = body.indexOf('resendEmailChallenge(');
  const resendFnAt = body.search(/const\s+resendOtp\s*=/);
  if (resendAt >= 0 && resendFnAt >= 0 && resendAt < resendFnAt) {
    return 'resendEmailChallenge is called before the resend handler is defined, which means it runs on the '
      + 'sign-in path. That sends a second code and invalidates the first.';
  }
  if (!/emailChallengeSent\s*!==\s*false/.test(body)) {
    return 'the server\'s emailChallengeSent is not read with an explicit !== false. An older deployed copy of '
      + 'checkDeviceSession omits the field, and treating absent as "not sent" asks for a code that already arrived.';
  }
  return null;
});

check('no SMS channel is offered for a staff challenge', () => {
  const svc = read('admin-web/src/services/deviceAuthService.ts');
  const page = read('admin-web/src/pages/LoginPage.tsx');
  if (!svc || !page) return 'unreadable';
  if (/OtpMethod/.test(code(svc)) || /otpMethod/.test(code(page))) {
    return 'an SMS/email method choice is back. Staff challenges are recorded as pendingAdminEmailChallenge and '
      + 'the server has no SMS path for them, so the control could only ever throw.';
  }
  return null;
});

check('admin-web and the app call the same verification callable', () => {
  const svc = read('admin-web/src/services/deviceAuthService.ts');
  const app = read('src/firebase/authService.js');
  if (!svc || !app) return 'unreadable';
  if (!svc.includes("'checkDeviceSession'")) return 'admin-web does not call checkDeviceSession.';
  if (!app.includes("'checkDeviceSession'")) return 'the app does not call checkDeviceSession.';
  if (/confirmDeviceSwitch/.test(code(svc))) {
    return 'admin-web calls confirmDeviceSwitch. Staff get a pendingAdminEmailChallenge, not a '
      + 'pendingDeviceApproval, so that callable throws "No pending verification for this device" forever.';
  }
  return null;
});

// --------------------------------------------------------------- report ----

if (failures.length) {
  console.error('Admin login parity FAILED:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\n${failures.length} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`Admin login parity: ${checks} checks passed.`);
