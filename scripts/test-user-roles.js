#!/usr/bin/env node
'use strict';
/**
 * The two copies of "who may create whom".
 *
 * functions/userManagement.js decides; src/firebase/userManagementService.js
 * is what the screen offers. The backend has allowed support and finance all
 * along and the client copy did not list them, so neither role could be
 * created or upgraded to from the app - and the staff home, the staff grids
 * and the capability model all existed for accounts nobody could make.
 *
 * Drift one way is a dead option; drift the other is a button that fails when
 * pressed. Either way the two must match.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const backend = require('../functions/userManagement.js');
// The matrices are module-level constants, not exports, so they are read from
// the source rather than by importing a file that needs firebase-admin.
function constFrom(src, name) {
  const at = src.indexOf(`const ${name} = `);
  assert(at !== -1, `${name} not found`);
  const open = src.indexOf('{', at);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  // eslint-disable-next-line no-new-func
  return new Function(`return ${src.slice(open, i + 1)};`)();
}

const serverRoles = constFrom(read('functions/userManagement.js'), 'ROLE_PERMISSIONS');
const clientRoles = constFrom(read('src/firebase/userManagementService.js'), 'ROLE_PERMISSIONS');
// The downgrade target is derived on both sides now, so the two derivations
// are compared by what they answer rather than by their source.
function downgradeFnFrom(rel) {
  const src = read(rel);
  const at = src.indexOf('function downgradeTargetsFor');
  assert(at !== -1, `${rel} has no downgradeTargetsFor`);
  const end = src.indexOf('\n}', at) + 2;
  return new Function(
    `const ROLE_PERMISSIONS=${JSON.stringify(constFrom(src, 'ROLE_PERMISSIONS'))};`
    + `const DOWNGRADABLE=${JSON.stringify(constFrom(src, 'DOWNGRADABLE'))};`
    + `const ROLE_RANK=${JSON.stringify(constFrom(src, 'ROLE_RANK'))};`
    + src.slice(at, end) + ';return downgradeTargetsFor;',
  )();
}
const serverDowngrade = downgradeFnFrom('functions/userManagement.js');
const clientDowngrade = downgradeFnFrom('src/firebase/userManagementService.js');

console.log('The app offers exactly what the backend allows');
assert.deepStrictEqual(Object.keys(clientRoles).sort(), Object.keys(serverRoles).sort(),
  'the same roles must manage users on both sides');
for (const role of Object.keys(serverRoles)) {
  assert.deepStrictEqual([...clientRoles[role].canCreate].sort(), [...serverRoles[role].canCreate].sort(),
    `${role} must be offered exactly the accounts it can create`);
  assert.deepStrictEqual([...clientRoles[role].canUpgradeTo].sort(), [...serverRoles[role].canUpgradeTo].sort(),
    `${role} must be offered exactly the upgrades it can perform`);
}
const ALL_ROLES = ['customer', 'dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin'];
for (const caller of ALL_ROLES) {
  for (const target of ALL_ROLES) {
    assert.deepStrictEqual(clientDowngrade(caller, target), serverDowngrade(caller, target),
      `the downgrade options a ${caller} is offered for a ${target} must be the ones the backend accepts`);
  }
}

console.log('A downgrade offers a choice, without widening who may make it');
// The choice is new. Who may downgrade whom is not, and deriving that part
// from rank alone let an admin demote another admin and let support demote a
// dealer - neither was ever allowed.
assert.deepStrictEqual(serverDowngrade('admin', 'admin'), [], 'an admin must not demote another admin');
assert.deepStrictEqual(serverDowngrade('support', 'dealer'), [], 'support must not downgrade anyone');
assert.deepStrictEqual(serverDowngrade('admin', 'superadmin'), [], 'an admin must not touch a superadmin');
assert.deepStrictEqual(serverDowngrade('dealer', 'dealer'), ['customer'], 'a dealer keeps exactly its old one option');
// And where there is a choice, it is a real one.
const adminOptions = serverDowngrade('superadmin', 'admin');
assert(adminOptions.length > 1, 'a superadmin must be able to choose what an admin becomes');
assert(adminOptions.includes('customer') && adminOptions.includes('dealer'), 'including the old fixed target');
assert(!adminOptions.includes('admin'), 'the role already held is not an option');
assert(!adminOptions.includes('superadmin'), 'a downgrade cannot promote');

// Deriving the options is half of it. The role now arrives from the client, so
// the server has to check it against that set - without this line the picker
// is advisory and a caller can send whatever they like.
const serverSrc = read('functions/userManagement.js');
assert(/const allowed = downgradeTargetsFor\(currentRole, previousRole\);/.test(serverSrc),
  'the server must compute what is allowed');
assert(/if \(!allowed\.includes\(newRole\)\) throw new HttpsError/.test(serverSrc),
  'the server must refuse a role outside that set, or the picker is only a suggestion');
assert(/const requested = String\(requestedRole \|\| ''\)\.trim\(\);/.test(serverSrc),
  'the server must read the caller\'s choice');

console.log('Support and finance can actually be created');
for (const role of ['support', 'finance']) {
  assert(serverRoles.superadmin.canCreate.includes(role), `superadmin must create ${role}`);
  assert(clientRoles.superadmin.canCreate.includes(role), `the app must offer superadmin ${role}`);
  assert(clientRoles.admin.canCreate.includes(role), `the app must offer admin ${role}`);
  assert(clientRoles.superadmin.canUpgradeTo.includes(role), `a customer must be upgradable to ${role}`);
}

console.log('And then seen');
const screen = read('src/screens/UserManagementScreen.js');
for (const role of ['support', 'finance']) {
  assert(new RegExp(`${role}: '`).test(screen), `${role} needs a label, or its badge reads as a raw role name`);
  assert(new RegExp(`${role}: 1`).test(screen), `${role} needs a rank, or the upgrade list filters it out`);
}
// A created account that appears in no section is invisible to whoever made it.
assert(/const staffList = visibleUsers\.filter/.test(screen), 'support and finance need a section');
assert(/u\.role === 'support' \|\| u\.role === 'finance'/.test(screen), 'that section must hold both');

console.log('\nThe app offers the roles the backend accepts, and shows them once made.');
