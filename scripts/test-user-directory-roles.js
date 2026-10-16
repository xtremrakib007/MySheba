#!/usr/bin/env node
'use strict';
/**
 * Every role a superadmin or admin can create must show up in their User
 * Management list. Retail (and support/finance) accounts were created but the
 * directory never returned them, and the screen had no Retail section.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const dir = read('functions/userDirectoryService.js');
const lists = [...dir.matchAll(/allowedRoles = \[([^\]]*)\]/g)].map((m) => m[1].match(/'(\w+)'/g).map((r) => r.slice(1, -1)));
assert.strictEqual(lists.length, 2, 'a superadmin list and an admin list');
const [superadminRoles, adminRoles] = lists;

const perms = read('functions/userManagement.js');
const canCreate = (role) => {
  const m = new RegExp(role + ": \\{ canCreate: \\[([^\\]]*)\\]").exec(perms);
  return m[1].match(/'(\w+)'/g).map((r) => r.slice(1, -1));
};
for (const r of canCreate('superadmin')) assert.ok(superadminRoles.includes(r), `superadmin list includes ${r}`);
for (const r of canCreate('admin')) assert.ok(adminRoles.includes(r), `admin list includes ${r}`);

const screen = read('src/screens/UserManagementScreen.js');
for (const role of ['admin', 'dealer', 'reseller', 'retail', 'support', 'finance', 'customer']) {
  assert.ok(new RegExp(`u\\.role === '${role}'`).test(screen), `the screen has a section showing ${role}`);
}
console.log('user directory roles: ok');
