#!/usr/bin/env node
'use strict';

/**
 * The sidebar's safe area, and the forgot-password flow.
 *
 * SIDEBAR. App.js wraps the whole app in <SafeAreaView edges={['top','bottom']}>,
 * so every screen is inset from the status bar and the system navigation bar.
 * A React Native Modal renders in its own native window OUTSIDE that hierarchy,
 * and the sidebar is the app's only full-height Modal - so it was the one piece
 * of UI with no inset at all. At height:'100%' it ran under the status bar (a
 * hardcoded paddingTop: 48 was guessing at that) and under the navigation bar,
 * where the scroll list ends and Logout sits. The list could not be scrolled
 * clear of the system bar, which is what "sidebar scroll" means here.
 *
 * FORGOT PASSWORD. Three separate faults:
 *
 *   - resetPassword accepts exactly ONE proof. passwordReset.js:123 rejects the
 *     call when hasPhoneProof === hasEmailProof, so holding both is refused the
 *     same way as holding neither. The screen kept both in state and sent both,
 *     so an email link arriving after an SMS code was verified turned a
 *     finished verification into "Please verify your phone or email first."
 *
 *   - the deep-link listener was keyed on `email`, so it tore down and re-ran
 *     getInitialURL() on every keystroke, retrying a waiting link against a
 *     half-typed address and writing an error under the field each time.
 *
 *   - no ScrollView and no KeyboardAvoidingView, alone among the three screens
 *     in this flow, so the keyboard covered the fields it had opened for.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
// Comments explain the bugs these checks guard, in the very words the checks
// look for. Matching them would pass on the explanation instead of the fix.
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let failed = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  ok   ${name}`);
  else { failed += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

const sidebar = code('src/components/Sidebar.js');
const forgot = code('src/screens/ForgotPasswordScreen.js');
const app = read('App.js');

console.log('\nThe sidebar respects the system bars');

check('App.js still insets everything else', /SafeAreaView[^>]*edges=\{\['top', ?'bottom'\]\}/.test(app));
check('the drawer is still a Modal, outside that', /<Modal visible=\{sidebarVisible\}/.test(sidebar));
check('so it reads the insets itself', /useSafeAreaInsets\(\)/.test(sidebar));
check('the header clears the status bar', /paddingTop: insets\.top/.test(sidebar));
check('the logout row clears the navigation bar', /paddingBottom: insets\.bottom/.test(sidebar));
// The hardcoded value was the guess this replaces; leaving it would double up.
check('and the guessed padding is gone', !/paddingTop: 48/.test(sidebar));
check('the menu list is still the flexible part', /menuScroll: \{ flex: 1 \}/.test(sidebar));

console.log('\nThe access screens are findable, and listed once');
// Grid Access and WebView Pages were reachable only through System Control >
// System, two taps in, so the grid scoping and the WebView editor read as
// features that did not exist. And featureAccess was in the sidebar twice -
// "Feature Access" for admins and "Tool Access" for superadmins - one screen
// under two names, which is the other half of the same report.
for (const key of ['gridManagement', 'featureAccess', 'webviewManagement']) {
  check(`${key} is in the sidebar`, new RegExp(`key: '${key}'`).test(sidebar));
}
// This used to require TWO entries - "admin group + superadmin group, no more"
// - which was the bug it was written to catch, half-fixed. A superadmin sees
// COMMON + ADMIN + SUPERADMIN groups at once, so the admin group's copy already
// reaches them: the second was the same screen listed twice in one drawer, the
// very thing removing "Tool Access" was meant to end. One entry, in a group an
// admin can see, serves both roles.
check('and featureAccess is listed exactly once',
  (sidebar.match(/key: 'featureAccess'/g) || []).length === 1, 'one screen, one row');
check('in a group an admin sees, so it is not superadmin-only',
  sidebar.indexOf("key: 'featureAccess'") < sidebar.indexOf('const SUPERADMIN_GROUPS'));
check('Tool Access is gone', !/Tool Access/.test(sidebar));
// goTo refuses anything Grid Management switched off, and these are how a
// superadmin switches things back on - locking yourself out of the unlock.
check('the access screens cannot be gated by the grid they govern',
  /'adminHome','adminFeatures','gridManagement','webviewManagement','featureAccess'/.test(sidebar));

console.log('\nForgot password sends exactly one proof');

check('verifying by SMS clears the email proof', /setPhoneIdToken\(result\.idToken\); setEmailIdToken\(null\)/.test(forgot));
check('verifying by link clears the phone proof', /setEmailIdToken\(result\.idToken\); setPhoneIdToken\(null\)/.test(forgot));
check('and it refuses to submit with neither', /if \(!phoneIdToken && !emailIdToken\) return setError/.test(forgot));
// The server is the one that insists, so the rule has to still be there.
const reset = code('functions/passwordReset.js');
check('the server still requires exactly one', /if \(hasPhoneProof === hasEmailProof\)/.test(reset));

console.log('\nThe deep-link listener registers once');

check('the address is read through a ref', /emailRef\.current/.test(forgot));
// Only the Linking effect matters: the one-line effect that keeps the ref in
// step with the field is supposed to depend on `email`.
const listener = forgot.slice(forgot.indexOf('Linking.addEventListener'));
check('and the listener itself depends on nothing',
  /^[\s\S]{0,600}?\}, \[\]\);/.test(listener),
  'the Linking effect still re-registers when something changes');

console.log('\nIt behaves like the other two screens in the flow');

for (const [file, name] of [
  ['src/screens/LoginScreen.js', 'Login'],
  ['src/screens/RegisterScreen.js', 'Register'],
  ['src/screens/ForgotPasswordScreen.js', 'Forgot Password'],
]) {
  const text = read(file);
  check(`${name} survives the keyboard`, /KeyboardAvoidingView/.test(text) && /keyboardShouldPersistTaps/.test(text));
}

console.log('\nAnd it follows the theme');

// White is correct ON the brand gradient and ON the primary button; anywhere
// else a fixed colour means the screen stays light while the app goes dark.
const styles = forgot.slice(forgot.indexOf('function createStyles'));
const fixed = (styles.match(/(color|backgroundColor):\s*'(white|#[0-9a-fA-F]{3,6})'/g) || []);
check('no fixed colours beyond text on brand', fixed.length === 2, fixed.join(', '));
check('inputs use the themed field background', /backgroundColor:colors\.inputBg/.test(styles));
check('and placeholders are themed too', /placeholderTextColor=\{colors\.placeholder\}/.test(forgot));

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('Sidebar clears the system bars; password reset scrolls and sends one proof.');
