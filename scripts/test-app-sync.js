#!/usr/bin/env node
'use strict';
/**
 * The refresh button.
 *
 * "It's not updating" means two different things - a balance stale because the
 * listener dropped with the signal, and an app still running last week's
 * bundle - and one button answers both. Every way it can go wrong is quiet:
 * a reconnect that leaves Firestore offline, an update check that reports "no
 * update" while one sits downloaded on disk, or a restart that throws away a
 * half-filled form nobody agreed to lose.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const util = read('src/utils/appSync.js');
const button = read('src/components/SyncButton.js');
const header = read('src/components/AppHeader.js');
const sidebar = read('src/components/Sidebar.js');

console.log('A failed refresh cannot leave the app offline');
// disableNetwork then enableNetwork is how a listener is made to re-deliver.
// If the enable is not in a finally, a disable that throws leaves Firestore
// switched off and the refresh button becomes a way to break the app.
const resync = util.slice(util.indexOf('export async function resyncData'));
assert(/try \{\s*await disableNetwork\(db\);\s*\} finally \{\s*await enableNetwork\(db\);/.test(resync),
  'enableNetwork must run in a finally, not only on the happy path');

console.log('An already-downloaded bundle is not reported as "no update"');
// UpdateGate's automatic check downloads in the background. For such a bundle
// checkForUpdateAsync says available and fetchUpdateAsync then says not new -
// so a check that ignores the pending flag tells the person they are up to
// date while the new version sits on disk.
assert(/export async function fetchUpdateIfAny\(pending\) \{\s*\n\s*if \(pending\) return true;/.test(util),
  'a pending bundle must short-circuit the check');
assert(/useUpdates\(\)/.test(button), 'and the button must read that flag');
assert(/fetchUpdateIfAny\(isUpdatePending\)/.test(button), 'and pass it in');

console.log('Nothing restarts without being asked');
// A restart discards a half-filled remittance form. Nobody taps refresh
// expecting to lose one.
assert(!/await reloadApp\(\)/.test(button), 'the button must not restart as part of its own flow');
assert(/onPress: \(\) => \{\s*\n\s*reloadApp\(\)/.test(button),
  'a restart may only happen from a button the person pressed');
assert(/text: 'Later', style: 'cancel'/.test(button), 'and declining must be offered');

console.log('A dead network stops before offering a restart');
// Restarting with no connection drops somebody on a login screen they cannot
// get past, so a failed reconnect must not fall through to the update check.
assert(/if \(!refreshed\) \{ setBusy\(false\); return; \}/.test(button),
  'a failed refresh must return, not continue to the restart offer');

console.log('A build that cannot restart says so');
assert(/This build cannot restart itself/.test(util), 'reloadApp explains itself when updates are off');
assert(/updatesActive\(\)\s*\n\s*\? \[\{ text: 'Done'/.test(button),
  'and no "Restart anyway" is offered where it could only fail');

console.log('Every role can reach it');
// AppHeader is on two screens. Dealer, reseller, support and finance homes
// each roll their own header, and all of them open the sidebar - so the
// sidebar row is the one that covers everybody.
assert(/<SyncButton \/>/.test(header), 'the header carries the button');
assert(/useAppSync\(\)/.test(sidebar), 'and the sidebar carries the same action');
assert(/closeSidebar\(\); sync\(\);/.test(sidebar), 'closing first, so the alert is not behind the drawer');

console.log('\nOne button: reconnect now, restart only if asked.');
