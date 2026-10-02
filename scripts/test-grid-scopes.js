#!/usr/bin/env node
'use strict';

/**
 * Who a grid tile is hidden from, not just whether it is hidden.
 *
 * settings/gridManagement was one flat {key: boolean}: a tile was on for
 * everyone or off for everyone. Three scoped maps now sit beside those
 * defaults - byRole, byCountry (ISO code, derived from the signup dial code)
 * and byUser - and the most specific wins: user, then country, then role, then
 * the global default.
 *
 * The risk in a precedence chain is that it reads correctly and resolves
 * wrongly, so every step is checked here, including the cases that must NOT
 * change anything: adding scopes has to be invisible until someone sets one.
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function run(relPath, requireShim) {
  const code = esbuild.transformSync(fs.readFileSync(path.join(ROOT, relPath), 'utf8'), {
    loader: 'js',
    format: 'cjs',
  }).code;
  const box = { module: { exports: {} }, exports: {}, require: requireShim };
  box.module.exports = box.exports;
  vm.createContext(box);
  vm.runInContext(code, box);
  return box.module.exports;
}

function loadService() {
  // phoneCountry is loaded for real rather than stubbed: viewerFor derives the
  // country from the signup dial code, and a stub would let that derivation
  // break without anything noticing.
  const countries = run('src/data/phoneCountries.js', (id) => { throw new Error(id); });
  const phoneCountry = run('src/utils/phoneCountry.js', (id) => {
    if (id === '../data/phoneCountries') return countries;
    throw new Error(`unexpected require: ${id}`);
  });
  return run('src/firebase/gridManagementService.js', (id) => {
    if (id === 'firebase/firestore') {
      return {
        doc: () => ({}), getDoc: async () => ({}), setDoc: async () => {},
        onSnapshot: () => () => {}, serverTimestamp: () => ({}), deleteField: () => ({}),
      };
    }
    if (id === './config') return { db: {} };
    if (id === '../utils/phoneCountry') return phoneCountry;
    throw new Error(`unexpected require: ${id}`);
  });
}

const grid = loadService();

let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ok   ${name}`);
  else { failed += 1; console.error(`  FAIL ${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}

// check() compares values; the wiring checks below are plain assertions.
const yes = (name, condition) => check(name, Boolean(condition), true);

const viewer = (o) => ({ uid: '', role: '', country: '', ...o });
const DOC = {
  recharge: true,
  fomema: true,
  rates: true,
  byRole: { dealer: { rates: false } },
  byCountry: { BD: { fomema: false } },
  byUser: { 'u-1': { recharge: false, fomema: true } },
};

console.log('\nNothing changes until a scope is set');
check('no viewer answers the global default', grid.isGridActive(DOC, 'rates'), true);
check('an id with no override falls through',
  grid.isGridActive(DOC, 'rates', viewer({ uid: 'nobody', country: 'XX', role: 'customer' })), true);
check('a globally-off tile stays off', grid.isGridActive({ rates: false }, 'rates', viewer({ role: 'dealer' })), false);

console.log('\nEach scope applies to its own id only');
check('role override hides it for that role', grid.isGridActive(DOC, 'rates', viewer({ role: 'dealer' })), false);
check('and not for another role', grid.isGridActive(DOC, 'rates', viewer({ role: 'reseller' })), true);
check('country override hides it there', grid.isGridActive(DOC, 'fomema', viewer({ country: 'BD' })), false);
check('and leaves other countries alone', grid.isGridActive(DOC, 'fomema', viewer({ country: 'MY' })), true);

console.log('\nMost specific wins');
check('user beats country', grid.isGridActive(DOC, 'fomema', viewer({ uid: 'u-1', country: 'BD' })), true);
check('user beats role', grid.isGridActive(DOC, 'recharge', viewer({ uid: 'u-1', role: 'dealer' })), false);
check('country beats role', grid.isGridActive(
  { rates: true, byRole: { dealer: { rates: true } }, byCountry: { BD: { rates: false } } },
  'rates', viewer({ role: 'dealer', country: 'BD' })
), false);
// An override must be able to turn something back ON, or it is only ever a
// second way to hide things.
check('a scope can re-enable a globally-off tile',
  grid.isGridActive({ rates: false, byRole: { dealer: { rates: true } } }, 'rates', viewer({ role: 'dealer' })), true);

console.log('\nThe UI can explain which rule won');
check('it names the deciding scope', grid.resolutionFor(DOC, 'fomema', viewer({ uid: 'u-1', country: 'BD' })),
  { scope: 'byUser', who: 'u-1', active: true });
check('and says global when nothing overrode it', grid.resolutionFor(DOC, 'recharge', viewer({ role: 'customer' })),
  { scope: 'global', who: '', active: true });
check('overridesFor returns the set for one id', grid.overridesFor(DOC, 'byCountry', 'BD'), { fomema: false });
check('and an empty set for an id with none', grid.overridesFor(DOC, 'byCountry', 'MY'), {});

console.log('\nStored data is not trusted blindly');
// A tile removed from GRID_DEFS must not come back as an override nobody can
// see in the UI, and a malformed map must not throw on a customer's home screen.
check('unknown tile keys are dropped',
  grid._test.sanitizeScope({ dealer: { ghostTile: false, rates: false } }), { dealer: { rates: false } });
check('a non-boolean value is dropped',
  grid._test.sanitizeScope({ dealer: { rates: 'yes' } }), {});
check('the scoped maps survive a read',
  Object.keys(grid._test.merge({ byRole: { dealer: { rates: false } } })).includes('byRole'), true);
check('a non-object scope does not throw',
  grid.isGridActive({ rates: true, byRole: 'nonsense' }, 'rates', viewer({ role: 'dealer' })), true);
check('a non-object override does not throw',
  grid.isGridActive({ rates: true, byUser: { 'u-1': 'nonsense' } }, 'rates', viewer({ uid: 'u-1' })), true);

console.log('\nThe viewer is built once, from the profile');
check('role and uid come straight off the profile',
  grid.viewerFor({ uid: 'u-9', role: 'dealer', phoneCountryCode: '+60' }), { uid: 'u-9', role: 'dealer', country: 'MY' });
check('a Bangladeshi dial code resolves',
  grid.viewerFor({ uid: 'u-9', role: 'customer', phoneCountryCode: '+880' }).country, 'BD');
// A shared dial code must not be guessed into a country, or one customer gets
// another country's grid.
check('a shared dial code yields no country',
  grid.viewerFor({ uid: 'u-9', role: 'customer', phoneCountryCode: '+1' }).country, '');
check('no profile is harmless', grid.viewerFor(null), { uid: '', role: '', country: '' });

console.log('\nDefault on a scoped row says what it really inherits');
// The whole point: for a user, Default is their country's rule, not the global
// one. Answering globalActive here would mislead in exactly the cases a
// superadmin opens this screen to understand.
check('a user inherits their country rule, not the global default',
  grid.inheritedActive(DOC, 'fomema', 'byUser', 'u-1', { role: 'customer', country: 'BD' }), false);
check('and their role rule when the country has none',
  grid.inheritedActive(DOC, 'rates', 'byUser', 'u-1', { role: 'dealer', country: 'MY' }), false);
check('falling through to global when neither applies',
  grid.inheritedActive(DOC, 'rates', 'byUser', 'u-1', { role: 'customer', country: 'MY' }), true);
// Its own override must not be what it reports as inherited.
check('a country ignores its own override', grid.inheritedActive(DOC, 'fomema', 'byCountry', 'BD'), true);
check('a role ignores its own override', grid.inheritedActive(DOC, 'rates', 'byRole', 'dealer'), true);
check('and the doc is not mutated while working that out', DOC.byCountry.BD, { fomema: false });
check('no target means the global default', grid.inheritedActive(DOC, 'rates', 'byRole', ''), true);
check('an unknown scope means the global default', grid.inheritedActive(DOC, 'rates', 'nonsense', 'x'), true);

console.log('\nThe screen is wired to all of that');
const screen = fs.readFileSync(path.join(ROOT, 'src/screens/GridManagementScreen.js'), 'utf8');
yes('all four scopes are offered',
  ['global', 'byRole', 'byCountry', 'byUser'].every((k) => screen.includes(`key: '${k}'`)));
yes('a scoped write carries the scope and the id', /setGridActive\(key, action === 'on', scoped \? \{ scope, who \} : \{\}\)/.test(screen));
yes('Default clears the override rather than writing false', /clearGridOverride\(key, scope, who\)/.test(screen));
yes('nothing is written before a target is chosen', /if \(scoped && !who\)/.test(screen));
yes('the row label uses the inherited value, not the global one',
  /inheritedActive\(gridManagement, g\.key, scope, who/.test(screen) && !/default \$\{globalActive/.test(screen));
// An invented role string or a stray ISO code stores an override that can
// never match a viewer, so both lists come from the app's own data.
yes('roles come from the one role vocabulary', /TOGGLEABLE_ROLES/.test(screen) && !/\{ key: 'dealer', label:/.test(screen));
yes('countries come from the served-markets list', /countries\.map\(/.test(screen) && !/key: 'MY'/.test(screen));
yes('the user list is only fetched when picking a user', /scope !== 'byUser'\) return undefined/.test(screen));
yes('a failed directory load stops the spinner', /users === null && <ActivityIndicator/.test(screen) && /setLoadError\(/.test(screen));

console.log('\nThe viewer exists at all');
// byUser resolves on profile.uid, and a users document does not store its own
// id: subscribeProfile returned snap.data() alone, so the live profile had no
// uid from the first snapshot onwards and every per-user rule matched nothing.
const auth = fs.readFileSync(path.join(ROOT, 'src/firebase/authService.js'), 'utf8');
yes('the live profile carries its uid', /callback\(snap\.exists\(\) \? \{ uid, \.\.\.snap\.data\(\) \}/.test(auth));
yes('and so does a refetched one', /snap\.exists\(\) \? \{ uid, \.\.\.snap\.data\(\) \} : null/.test(auth));
const ctx = fs.readFileSync(path.join(ROOT, 'src/context/AppContext.js'), 'utf8');
yes('the context builds one viewer and shares it', /const gridViewer = useMemo\(/.test(ctx) && /^ {4}gridViewer,$/m.test(ctx));

console.log('\nEvery gate asks the scoped question');
// The bug this guards: a tile hidden from one person is still reachable if any
// gate resolves it globally. Nine call sites did, including the four in
// AppContext that actually start a service - so an override would have hidden
// the tile and changed nothing about what the person could do.
function callsWithoutViewer(file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const bad = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf('isGridActive(', from);
    if (at < 0) break;
    let depth = 0, commas = 0, i = at + 'isGridActive('.length - 1;
    for (; i < text.length; i += 1) {
      const c = text[i];
      if (c === '(' || c === '[' || c === '{') depth += 1;
      else if (c === ')' || c === ']' || c === '}') { depth -= 1; if (!depth) break; }
      else if (c === ',' && depth === 1) commas += 1;
    }
    if (commas < 2) bad.push(`${file}:${text.slice(0, at).split('\n').length}`);
    from = at + 1;
  }
  return bad;
}

const EXEMPT = ['src/firebase/gridManagementService.js', 'src/screens/GridManagementScreen.js'];
const consumers = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel);
    // Two files are exempt, both because a global read is the correct read
    // there: the service declares isGridActive and resolves its own viewer, and
    // the editing screen has to show the global default AS the global default
    // next to the scoped overrides.
    else if (entry.name.endsWith('.js') && !EXEMPT.includes(rel)) consumers.push(rel);
  }
})('src');

const unscoped = consumers.flatMap(callsWithoutViewer);
const gating = consumers.filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('isGridActive('));
yes(`all ${gating.length} gating files pass a viewer`, unscoped.length === 0);
if (unscoped.length) console.error(`       ${unscoped.join('\n       ')}`);

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('Grid tiles resolve per user, country, role, then global.');
