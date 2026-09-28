#!/usr/bin/env node
/**
 * "Every time I close the app I have to log in again AND enter an OTP."
 *
 * The OTP loop was unbreakable, and this is the chain:
 *
 *   1. A staff account (admin, superadmin, dealer, reseller) signs in.
 *      checkDeviceSession answers requiresOtp and records the challenge as
 *      pendingAdminEmailChallenge. It does NOT write pendingDeviceApproval -
 *      that is the non-staff branch.
 *
 *   2. AppContext's login handler routed to the verification screen and
 *      returned BEFORE setProfile(p). So `profile` was null.
 *
 *   3. DeviceVerifyScreen chose its callable with
 *      STAFF_ROLES.includes(profile?.role) - false, because the role was
 *      undefined - and called confirmDeviceSwitch.
 *
 *   4. confirmDeviceSwitch requires profile.pendingDeviceApproval for this
 *      device. A staff account has none. It throws.
 *
 *   5. Verification can never complete, so trustedDevices is never written,
 *      so the next sign-in asks for a code again - and that code fails the
 *      same way. Forever.
 *
 * The role was correct data sitting in the login response the whole time. It
 * simply was not carried to the screen that needed it.
 *
 * Run: npm run test:verify
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

const ctx = read('src', 'context', 'AppContext.js');
const screen = read('src', 'screens', 'DeviceVerifyScreen.js');
const policySrc = read('src', 'utils', 'devicePolicy.js');
const server = read('functions', 'deviceSessionService.js');

const failures = [];
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(name);
}

// --- the rule itself, exercised as code -----------------------------------
// devicePolicy.js is ESM; evaluate it here rather than depending on the
// runner's module mode.
// Strip the `export` keywords and keep the declarations as ordinary locals,
// then hand the bindings back. Rewriting `export const X` into `exports.X`
// instead would leave the bare `X` references inside the functions undefined.
const policy = {};
new Function('exports', policySrc.replace(/^export /gm, '')
  + '\nexports.STAFF_ROLES = STAFF_ROLES;'
  + '\nexports.verifyCallableFor = verifyCallableFor;'
  + '\nexports.isStaffRole = isStaffRole;')(policy);

check('staff roles resolve to checkDeviceSession',
  ['admin', 'superadmin', 'dealer', 'reseller']
    .every(r => policy.verifyCallableFor(r) === 'checkDeviceSession'),
  'only this callable verifies pendingAdminEmailChallenge and writes trustedDevices');

check('non-staff roles resolve to confirmDeviceSwitch',
  ['customer', 'support', 'finance']
    .every(r => policy.verifyCallableFor(r) === 'confirmDeviceSwitch'));

check('an unknown role resolves to nothing, not a guess',
  [undefined, null, '', 0, {}].every(r => policy.verifyCallableFor(r) === null),
  'guessing is what made the loop unbreakable - both guesses are wrong for half of all accounts');

// --- the role must actually reach the screen ------------------------------
const pendingBlocks = ctx.match(/setPendingDeviceVerification\(\{[\s\S]*?\}\);/g) || [];
check('every verification hand-off carries the role',
  pendingBlocks.length > 0 && pendingBlocks.every(b => /(^|\s)role:/m.test(b)),
  pendingBlocks.length + ' hand-off(s); '
    + pendingBlocks.filter(b => !/(^|\s)role:/m.test(b)).length + ' missing `role:`');

check('the login path sets the profile before routing to verification',
  /setPendingDeviceVerification\(\{[\s\S]*?\}\);\s*(\/\/[^\n]*\n\s*)*setProfile\(p\);\s*setScreen\("deviceVerify"\)/.test(ctx),
  'returning without setProfile is what left profile?.role undefined');

// --- the screen must not guess --------------------------------------------
check('the screen uses the shared policy',
  /verifyCallableFor\(/.test(screen) && /from '\.\.\/utils\/devicePolicy'/.test(screen));

check('the screen no longer keeps its own staff list',
  !/const STAFF_ROLES\s*=/.test(screen),
  'a second copy of the list is how the two sides drift apart');

check('the screen refuses to proceed with an unknown role',
  /if \(!callable\) throw/.test(screen),
  'better a clear error than silently calling the wrong callable');

check('the screen falls back to fetching the role',
  /fetchProfile\(uid\)[\s\S]{0,40}?role/.test(screen),
  'neither piece of state having it must not mean guessing');

// --- the server-side facts these depend on --------------------------------
check('confirmDeviceSwitch still requires pendingDeviceApproval',
  /const pending = profile\.pendingDeviceApproval;[\s\S]{0,200}?throw new HttpsError/.test(server),
  'if this ever stops being true, the staff/non-staff split can be simplified');

check('the staff branch still writes trustedDevices on verification',
  /verifiedNewStaffDevice\)\s*\{[\s\S]{0,300}?trustedDevices/.test(server),
  'this is what stops the NEXT sign-in asking for a code');

for (const c of checks) {
  console.log((c.ok ? 'ok   ' : 'FAIL ') + c.name + (c.detail && !c.ok ? '\n       ' + c.detail : ''));
}
console.log('');
if (failures.length) { console.error(failures.length + ' failure(s).'); process.exit(1); }
console.log('Device verification: all ' + checks.length + ' checks pass.');
