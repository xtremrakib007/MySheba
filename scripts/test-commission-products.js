#!/usr/bin/env node
'use strict';
/**
 * The Commission by product list shows every catalogue product, grouped as
 * IIMMPACT files them. App (src/utils/commissionProducts.js) and admin web
 * (admin-web/src/services/catalogMirror.ts) must group the same way.
 */
const assert = require('assert');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const run = (rel) => {
  const code = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: 'cjs', write: false, logLevel: 'silent',
    external: ['firebase/*', '../firebase/config'] }).outputFiles[0].text;
  const m = { exports: {} };
  const req = (id) => (/firebase|config/.test(id) ? {} : require(id));
  new Function('module', 'exports', 'require', code)(m, m.exports, req);
  return m.exports;
};
const app = run('src/utils/commissionProducts.js');
const web = run('admin-web/src/services/catalogMirror.ts');

const catalog = {
  products: {
    DI: { code: 'DI', name: 'Digi' }, CEL: { code: 'CEL', name: 'Celcom' }, TNB: { code: 'TNB', name: 'TNB' },
    SHELL: { code: 'SHELL', name: 'Shell e-Voucher' }, ORPH: { code: 'ORPH', name: 'Mystery' },
    DEAD: { code: 'DEAD', name: 'Old loan', is_active: false }, DEAD2: { code: 'DEAD2', name: 'Old saved', is_active: false },
  },
  tree: { groups: [
    { name: 'Mobile', categories: [{ name: 'Mobile Prepaid', product_codes: ['DI', 'CEL'] }] },
    { name: 'Bills', categories: [{ name: 'Electricity', product_codes: ['TNB', 'DEAD', 'DEAD2'] }] },
    { name: 'Vouchers', categories: [{ name: 'Fuel', product_codes: ['SHELL'] }, { name: 'Again', product_codes: ['DI'] }] },
  ] },
};
const labels = (groups) => groups.map((g) => `${g.label}: ${g.items.map((i) => i.code).join(',')}`);
const all = app.commissionProductGroups(catalog, ['DEAD2', 'GONE']);
assert.deepStrictEqual(labels(all), [
  'Mobile · Mobile Prepaid: CEL,DI',
  'Bills · Electricity: DEAD2,TNB',
  'Vouchers · Fuel: SHELL',
  'Other: ORPH',
  'Not in catalogue: GONE',
], 'every product once, inactive only when saved, saved-but-gone kept');
assert.deepStrictEqual(labels(app.commissionProductGroups(catalog, [], 'fuel')), ['Vouchers · Fuel: SHELL'], 'filter by category');
assert.deepStrictEqual(labels(app.commissionProductGroups(catalog, [], 'digi')), ['Mobile · Mobile Prepaid: DI'], 'filter by name');
for (const [saved, filter] of [[['DEAD2', 'GONE'], ''], [[], 'fuel'], [[], 'di'], [[], '']]) {
  assert.deepStrictEqual(web.commissionProductGroups(catalog, saved, filter), app.commissionProductGroups(catalog, saved, filter), `web and app agree (${filter})`);
}
assert.deepStrictEqual(app.commissionProductGroups(null), []);
console.log('commission products: ok');
