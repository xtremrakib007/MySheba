#!/usr/bin/env node
'use strict';
/**
 * The User Management screen.
 *
 * Two things here are not cosmetic.
 *
 * UserCard was declared inside UserManagementScreen's body, which makes it a new
 * component type on every render: React threw away and rebuilt every row on each
 * keystroke in the search box - exactly when the list is longest and typing most
 * needs to feel smooth.
 *
 * And the actions were six small pills wrapped into the corner of a row, where
 * Delete ended up the same size as Upgrade and a thumb's width from it. They are
 * an action sheet now, destructive ones tinted and last.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const screen = read('src/screens/UserManagementScreen.js');
const sheet = read('src/components/ActionSheet.js');

console.log('The row component is not rebuilt on every keystroke');
// Declared at module scope: no leading indentation, and outside the screen.
assert(/^function UserCard\(/m.test(screen), 'UserCard must be declared at module scope');
assert(!/^\s+function UserCard\(/m.test(screen), 'UserCard must not be nested inside the screen component');
assert(screen.indexOf('function UserCard(') < screen.indexOf('export default function UserManagementScreen'),
  'and must come before the screen that uses it');

console.log('A Manage button always opens something');
// One list decides both whether the button appears and what the sheet holds, so
// "button that opens an empty sheet" is not a reachable state.
assert(/actionCount=\{actionsFor\(u\)\.length\}/.test(screen), 'the button is driven by the same list as the sheet');
assert(/\{actionCount > 0 && \(/.test(screen), 'and is hidden when that list is empty');

console.log('Destructive actions are marked and last');
assert(/key: 'delete'[\s\S]{0,80}tone: 'danger'/.test(screen), 'delete is destructive');
assert(/Permanent\./.test(screen), 'and says so before it is tapped, not after');
// The sheet orders by tone rather than trusting callers to list them last.
assert(/const dangerous = rows\.filter\(\(a\) => a\.tone === 'danger'\)/.test(sheet),
  'the sheet separates destructive actions itself');
assert(sheet.indexOf('{dangerous.map(') > sheet.indexOf('{safe.map('),
  'and renders them after the safe ones');

console.log('The permission guards survived the restyle');
// These mirror functions/userManagement.js. They are not the security boundary
// - the server is - but dropping one offers an action that can only come back
// as a permission error, which reads as the app being broken.
assert(/const canModerate = isSuperadmin && u\.role !== 'superadmin'/.test(screen),
  'suspend and delete stay superadmin-only, and never target a superadmin');
assert(/validUpgradeOptions\(perms\.canUpgradeTo, u\.role\)/.test(screen),
  'upgrade options are still filtered to genuine promotions');
assert(/downgradeOptionsFor\(u\.role\)\.length > 0/.test(screen), 'downgrade is still gated');
assert(/canFreeze && \{/.test(screen), 'freezing is still gated to support and superadmin');

console.log('It works in the dark');
// This screen was full of light-mode hexes - #999 text, #FDECEC badges - which
// are invisible or garish on the dark theme the app ships.
const hexes = screen.match(/(?:color|backgroundColor|borderColor): '#[0-9A-Fa-f]{3,8}'/g) || [];
assert.deepStrictEqual(hexes, [], `hardcoded colours must come from the theme: ${hexes.join(', ')}`);
const sheetHexes = (sheet.match(/(?:color|backgroundColor|borderColor): '#[0-9A-Fa-f]{3,8}'/g) || []);
assert.deepStrictEqual(sheetHexes, [], `the sheet too: ${sheetHexes.join(', ')}`);

console.log('\nOne row, one Manage button, and a sheet that says what each action does.');
