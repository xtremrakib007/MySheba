#!/usr/bin/env node
'use strict';

/**
 * The admin bottom bar and the sidebar's opening state.
 *
 * Home and Management both landed on a grid - AdminHomeScreen's own, and
 * AdminFeaturesScreen's - so two of the five tabs did the same thing and the
 * labels gave no way to tell them apart. Management is now Operations, which
 * opens the pending queue: the thing an admin comes here to work through.
 *
 * The trap in doing that is documented in Sidebar.js: an AdminHomeScreen tab is
 * NOT a screen App.js renders, and passing a tab key to setScreen matches no
 * branch and renders a blank white page. Nine sidebar items shipped that way.
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

const nav = read('src/components/BottomNav.js');
const sidebar = read('src/components/Sidebar.js');
const adminHome = read('src/screens/AdminHomeScreen.js');
const app = read('App.js');

console.log('\nThe admin tier gets Operations, not a second grid');

check('Operations is the admin-tier tab', /key: 'operations'.*label: 'Operations'/.test(nav));
check('Management is gone for admins', !/isAdminTier.*'management'/.test(nav));
check('but dealers and resellers keep it', /key: 'management'.*label: 'Management'/.test(nav));
check('and customers keep Services', /key: 'services'.*label: 'Services'/.test(nav));

console.log('\nIt opens a tab, which is not a screen');

// setScreen('operations') would render nothing at all.
check('App.js has no screen by that name', !/renderedScreen === 'operations'/.test(app));
check('so it is opened the way goTo opens a tab',
  /setAdminTab\(OPERATIONS_TAB\)/.test(nav) && /setAdminViewingSection\(true\)/.test(nav) && /setScreen\('adminHome'\)/.test(nav));

const tabMatch = nav.match(/const OPERATIONS_TAB = '([^']+)'/);
check('the tab it picks is named', Boolean(tabMatch));
if (tabMatch) {
  const tab = tabMatch[1];
  // A tab AdminHomeScreen does not branch on is the same blank page by
  // another route.
  check(`AdminHomeScreen actually has a '${tab}' tab`, adminHome.includes(`'${tab}'`));
}

console.log('\nHome and Operations are distinguishable while you are in one');

// Both are adminHome, so `screen` alone cannot separate them: without the
// section flag, Home stayed lit while you worked in Operations.
check('Operations lights up on its own tab', /tab\.key === 'operations'\s*\?\s*onOperations/.test(nav));
check('and Home stops claiming to be active there',
  /HOME_SCREENS\.includes\(screen\) && !onOperations/.test(nav));
check('using the same test the sidebar uses',
  /screen === 'adminHome' && adminViewingSection && adminTab === OPERATIONS_TAB/.test(nav));

console.log('\nThe sidebar opens collapsed');

check('groups track what is expanded, not what is collapsed', /const \[expanded, setExpanded\] = useState\(\{\}\)/.test(sidebar));
check('so an empty state means every group is shut', /const isCollapsed = !expanded\[group\.title\]/.test(sidebar));
check('tapping a header toggles that one group', /setExpanded\(\(prev\) => \(\{ \.\.\.prev, \[title\]: !prev\[title\] \}\)\)/.test(sidebar));
check('and every open starts shut again', /setExpanded\(\{\}\);/.test(sidebar));
check('no collapsed state is left behind', !/setCollapsed|collapsed\[/.test(sidebar));

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('Operations opens the queue, and the sidebar opens tidy.');
