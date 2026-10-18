#!/usr/bin/env node
'use strict';
/**
 * Every role must be allowed onto the home screen it is sent to. Retail is
 * sent to customerHome, but the route guard (AppContext SCREEN_ROLES) let only
 * customers in, so a retail user was bounced and Home never opened.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const ROOT = path.join(__dirname, '..');
const code = esbuild.buildSync({ entryPoints: [path.join(ROOT, 'src/utils/homeScreen.js')], bundle: true, format: 'cjs', write: false, logLevel: 'silent' }).outputFiles[0].text;
const m = { exports: {} };
new Function('module', 'exports', 'require', code)(m, m.exports, require);
const { homeScreenForRole, STAFF_HOME_ROLES } = m.exports;

const ctx = fs.readFileSync(path.join(ROOT, 'src/context/AppContext.js'), 'utf8');
const block = ctx.slice(ctx.indexOf('const SCREEN_ROLES = {'), ctx.indexOf('};', ctx.indexOf('const SCREEN_ROLES = {')));
const allowed = (screen) => {
  const line = new RegExp(`\\n\\s*${screen}: ([^\\n]+)`).exec(block);
  assert.ok(line, `${screen} is guarded`);
  if (/STAFF_HOME_ROLES/.test(line[1])) return STAFF_HOME_ROLES;
  return line[1].match(/'(\w+)'/g).map((r) => r.slice(1, -1));
};
for (const role of ['customer', 'retail', 'dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin']) {
  const home = homeScreenForRole(role);
  assert.ok(allowed(home).includes(role), `${role} may open its home (${home})`);
}
console.log('role home: ok');
