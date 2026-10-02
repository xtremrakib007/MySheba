#!/usr/bin/env node
'use strict';

/**
 * The admin Management screen: who sees its hubs, and what the device back
 * button does inside them.
 *
 * Two bugs, both invisible to anyone testing as a superadmin.
 *
 * 1. Financial Management was gated on being a superadmin. The landing filter
 *    reads CAPABILITY_FOR[item.key], and the hub tiles only had entries for
 *    the items INSIDE them, never for the hubs themselves. With no entry the
 *    filter falls through to
 *
 *      return !item.section || isSuperadmin || item.service || item.screen;
 *
 *    and a hub tile has a section, no service and no screen - so the whole
 *    branch collapses to isSuperadmin. An ordinary admin holding both
 *    'settings' and 'finance', the two capabilities every tile inside the hub
 *    asks for, could not see the hub that contains them.
 *
 * 2. The hardware back button skipped both of this screen's local views.
 *    `section` and `rateView` are component state, not screens, so back fell
 *    through to goBack() and left the screen entirely: one press from
 *    Financial Management landed on the dashboard, and the next armed "press
 *    back again to exit". The on-screen arrow worked the whole time, which is
 *    why it reads as the device button misbehaving.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  ok   ${name}`);
  else { failed += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

const screen = read('src/screens/AdminFeaturesScreen.js');
const ctx = read('src/context/AppContext.js');

const slice = (from, to) => screen.slice(screen.indexOf(from), screen.indexOf(to));
const keysIn = (text) => [...text.matchAll(/([a-zA-Z]+):\s*\[/g)].map((m) => m[1]);

console.log('\nEvery hub tile says which capability opens it');

const capabilities = keysIn(slice('const CAPABILITY_FOR', 'const SYSTEM'));
// A hub is any landing tile routed by `section`. Each one needs an entry, or
// the filter silently reduces to isSuperadmin for it.
// ADMIN_HOME moved to components/serviceTiles.js when the WebView
// configuration had to be applied to this grid as well as ServiceGrid's.
const adminHome = read('src/components/serviceTiles.js');
const hubs = [...adminHome.matchAll(/key: '([a-zA-Z]+)'[^}]*section: '([a-zA-Z]+)'/g)].map((m) => m[1]);
check('the landing grid still has at least one hub tile', hubs.length > 0);
for (const hub of hubs) {
  check(`'${hub}' is in CAPABILITY_FOR`, capabilities.includes(hub),
    'without it the landing filter falls through to isSuperadmin and hides the hub from ordinary admins');
}

// Reproduce the filter rather than trusting the list above: this is the branch
// that actually decides, and it is the one that was wrong.
function sees(item, role, caps) {
  if (item.section === 'system' && role !== 'superadmin') return false;
  const need = capabilities.includes(item.key) ? ['settings', 'finance'] : undefined;
  if (!need) return Boolean(!item.section || role === 'superadmin' || item.service || item.screen);
  return need.some((cap) => role === 'superadmin' || caps.includes(cap));
}
const financeTile = { key: 'finance', section: 'finance' };
check('an admin with finance + settings sees Financial Management',
  sees(financeTile, 'admin', ['settings', 'finance']) === true);
check('a superadmin still sees it', sees(financeTile, 'superadmin', []) === true);
check('an admin with neither capability does not',
  sees(financeTile, 'admin', ['support']) === false);

console.log('\nThe device back button unwinds the local views');

check('the screen registers a back interceptor', /setHomeBackInterceptor\(\(\) => \{/.test(screen));
check('it takes it from the context', /setHomeBackInterceptor[,\s]/.test(screen.slice(screen.indexOf('} = useApp()') - 600, screen.indexOf('} = useApp()'))));
check('Rates closes before the section it opened from',
  /if \(rateView\) \{ setRateView\(false\); return true; \}[\s\S]{0,80}if \(section\) \{ setSection\(null\); return true; \}/.test(screen));
check('and it declines any press it did not handle', /return false;\s*\}\);/.test(screen));
check('it is torn down when the screen goes away', /return \(\) => setHomeBackInterceptor\(null\)/.test(screen));
check('and re-registered when either view changes', /\}, \[rateView, section, setHomeBackInterceptor\]\)/.test(screen));

console.log('\nThe interceptor is consulted before the exit prompt');

// Order is the whole point: HOME_SCREENS arms "press back again to exit", so a
// handler consulted after it could never stop that prompt.
const interceptorAt = ctx.indexOf('homeBackInterceptorRef.current()');
const exitPromptAt = ctx.indexOf('HOME_SCREENS.includes(screen)');
const goBackAt = ctx.indexOf('if (goBack()) return true;');
check('AppContext still has both', interceptorAt > 0 && exitPromptAt > 0 && goBackAt > 0);
check('the interceptor runs before the exit prompt', interceptorAt < exitPromptAt);
check('and before goBack leaves the screen', interceptorAt < goBackAt);

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('Hubs are gated by capability, and back unwinds them.');
