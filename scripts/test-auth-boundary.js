#!/usr/bin/env node
/**
 * "I close the app and it shows the login page."
 *
 * It was not a sign-out. The hard auth boundary read
 *
 *     if (!authUser || !profile) -> setScreen("login")
 *
 * and a missing PROFILE is not a missing SESSION. On a cold start Firebase
 * restores the user immediately and Firestore answers a moment later - or on
 * a slow, offline or cache-cold start, much later. In that window authUser is
 * set, its token is valid, and profile is still null. The first-route
 * watchdog clears authLoading after 8 seconds regardless, `screen` has never
 * moved off its initial "login", and the app renders the login form to
 * someone who is signed in.
 *
 * Nothing recorded a sign-out, because none happened. That is why the token
 * probe came back `ok - token 977` while the person was looking at the login
 * screen, and why no amount of fixing token revocation on the server changed
 * anything.
 *
 * Run: npm run test:boundary
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ctx = fs.readFileSync(path.join(root, 'src', 'context', 'AppContext.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');

const failures = [];
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(name);
}

// --- the boundary itself ---------------------------------------------------
check('the auth boundary does not route to login on a missing profile',
  !/if\s*\(\s*!authUser\s*\|\|\s*!profile\s*\)\s*\{[\s\S]{0,400}?setScreen\("login"\)/.test(ctx),
  'found a `!authUser || !profile` that routes to login - a null profile is'
  + ' not a signed-out session. The same condition as an early return is fine.');

check('the auth boundary still routes to login with no auth user',
  /if\s*\(\s*!authUser\s*\)\s*\{[\s\S]{0,400}?setScreen\("login"\)/.test(ctx),
  'a device with no Firebase user must not stay on a protected screen');

check('the boundary no longer depends on profile',
  /\}, \[authLoading, authUser, screen\]\);/.test(ctx),
  'dependency array should be [authLoading, authUser, screen]');

// --- the restoring state ---------------------------------------------------
check('AppContext exposes sessionRestoring',
  /const sessionRestoring = !!authUser && !profile;/.test(ctx)
  && /^\s*sessionRestoring,$/m.test(ctx));

check('App.js renders a restoring state instead of the login form',
  /sessionRestoring\s*&&\s*renderedScreen === 'login'/.test(app),
  'the login form must not render while a session is being restored');

check('the restoring state offers a way out',
  /restoring[\s\S]{0,600}?onPress=\{logout\}/.test(app),
  'a profile that never arrives must not trap the person');

// --- a blocked account must still be signed out ----------------------------
// With the boundary no longer keying on profile, clearing the profile is not
// enough to end a session. The one case that MEANS "this account may not use
// the app" has to say so.
// A fatal profile error must NOT sign out. Two permission-denied answers
// 1.5s apart usually mean a blocked account, but they are also what a token
// still propagating looks like on a slow link, and the costs are not
// symmetric: a blocked account held on a screen that explains itself can
// still log out, a wrongly signed-out one has lost its session.
check('a fatal profile error does not sign the session out',
  !/action === "fatal"[\s\S]{0,2000}?authService\.logout\(\)/.test(ctx),
  'a rules race must not destroy a valid session');

check('a fatal profile error is surfaced to the person',
  /action === "fatal"[\s\S]{0,2000}?setProfileFatal\(/.test(ctx)
  && /profileFatal/.test(app),
  'otherwise a blocked account sits on a spinner with no explanation');

check('a transient profile error does NOT sign out',
  !/Transient[\s\S]{0,400}?authService\.logout\(\)/.test(ctx),
  'no network must never end a session');

// --- the watchdog that exposed all this ------------------------------------
check('the first-route watchdog still exists',
  /FIRST_ROUTE_TIMEOUT_MS/.test(ctx),
  'it must keep clearing authLoading so the splash cannot hang');

for (const c of checks) console.log((c.ok ? 'ok   ' : 'FAIL ') + c.name + (c.detail && !c.ok ? '\n       ' + c.detail : ''));
console.log('');
if (failures.length) { console.error(failures.length + ' failure(s).'); process.exit(1); }
console.log('Auth boundary: all ' + checks.length + ' checks pass.');
