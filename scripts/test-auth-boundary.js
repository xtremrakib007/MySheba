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
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

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

// --- signed in must never sit on the login form ----------------------------
// The boundary only pushes people out when the session is gone. Nothing pulled
// them back in when the session was fine but `screen` was "login" - which is
// where it starts on every cold launch. Hardware back from that login form
// revealed the home screen, which is what proved the session was valid.
check('a signed-in session is routed off the login form',
  /if \(screen !== "login"\) return;[\s\S]{0,300}?setScreen\(homeScreenForRole/.test(ctx),
  'a valid session left on "login" has nothing to correct it');

check('that correction does not fire during device verification',
  /if \(pendingDeviceVerification \|\| pendingGooglePhone\) return;[\s\S]{0,200}?if \(screen !== "login"\)/.test(ctx),
  'deviceVerify and googlePhone are deliberate destinations');

// --- back must not walk into the app after a sign-out ----------------------
// Every sign-out empties screenHistoryRef then calls setScreen("login"), but
// the push effect runs AFTER that state change and pushed the screen being
// left onto the array that had just been emptied. Clearing was a no-op.
check('no history is pushed when navigating TO a pre-auth screen',
  /!PRE_AUTH_SCREENS\.includes\(prev\)\s*&&\s*!PRE_AUTH_SCREENS\.includes\(screen\)/.test(ctx),
  'otherwise hardware back from the login screen re-opens the app');

// --- one source of truth for role homes ------------------------------------
// Both AUTH routing paths - the cold-start router and the login-form
// correction - go through one mapping. The six sign-in handlers still inline
// theirs because each also picks a default tab; that duplication is real and
// worth removing, but it is not what this bug was.
// The mapping now lives in src/utils/homeScreen.js, because the route guard had
// its own copy that did not know about support or finance and sent them to the
// customer home. So this no longer asserts a local definition - it asserts that
// nobody redefines one, and that all three paths call the shared function: the
// cold-start router, the login-form correction, and the route guard.
check('every auth routing path shares one role-to-home mapping',
  /import \{ homeScreenForRole[^}]*\} from '\.\.\/utils\/homeScreen'/.test(ctx)
  && !/(const|function) homeScreenForRole *[=(]/.test(ctx)
  && /const routeForRole = \(p\) => setScreen\(homeScreenForRole/.test(ctx)
  && /if \(screen !== "login"\) return;[\s\S]{0,300}?setScreen\(homeScreenForRole/.test(ctx)
  && /const getHomeForRole = useCallback\(\(role\) => homeScreenForRole\(role\)/.test(ctx),
  'AppContext must import it and define none of its own');

// --- the screens you may be on while signed out -----------------------------
// Being signed out is not an error on these; it is the point of them. Every
// other screen with no Firebase user means a session ended, so the guard sends
// you to login.
//
// forgotPassword was missing from the list this guard reads, while a SECOND
// copy in BiometricOptInPrompt had it. The copy that mattered was the one
// without: the only moment anybody taps "Forgot Password?" is while signed out,
// so the guard fired the instant the screen was set and bounced them back
// before it drew. Tapping the link did nothing whatsoever.
const preAuth = read('src/utils/preAuthScreens.js');
check('the pre-auth list is shared, not copied',
  /export const PRE_AUTH_SCREENS/.test(preAuth)
  && /import \{ PRE_AUTH_SCREENS \} from '\.\.\/utils\/preAuthScreens'/.test(ctx)
  && !/const PRE_AUTH_SCREENS = \[/.test(ctx),
  'AppContext must import it and define none of its own');
check('and the prompt reads the same one',
  /import \{ PRE_AUTH_SCREENS \} from '\.\.\/utils\/preAuthScreens'/.test(read('src/components/BiometricOptInPrompt.js'))
  && !/const preAuthScreens = \[/.test(read('src/components/BiometricOptInPrompt.js')));

// Every screen App.js can render before anybody signs in has to be on it, or
// the guard throws you off the moment you arrive.
for (const screen of ['login', 'register', 'forgotPassword', 'deviceVerify', 'googlePhone']) {
  check(`${screen} survives being signed out`,
    new RegExp(`'${screen}'`).test(preAuth),
    'the signed-out guard sends anything missing straight back to login');
}

// --- the watchdog that exposed all this ------------------------------------
check('the first-route watchdog still exists',
  /FIRST_ROUTE_TIMEOUT_MS/.test(ctx),
  'it must keep clearing authLoading so the splash cannot hang');

for (const c of checks) console.log((c.ok ? 'ok   ' : 'FAIL ') + c.name + (c.detail && !c.ok ? '\n       ' + c.detail : ''));
console.log('');
if (failures.length) { console.error(failures.length + ' failure(s).'); process.exit(1); }
console.log('Auth boundary: all ' + checks.length + ' checks pass.');
