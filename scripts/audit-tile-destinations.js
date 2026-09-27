#!/usr/bin/env node
/**
 * Every tile must go where its label says.
 *
 * A tile is a { key, name, kind } row in a data table, and what it opens is
 * decided by `kind` in useServiceAction. Nothing checks the two agree, and
 * the failure modes are all quiet:
 *
 *   - a `kind` nobody handles falls through to startService(key), which
 *     renders nothing at all unless ServiceScreen has a step component for
 *     that key;
 *   - a `webview` key missing from webViewPages does NOT fail - WebViewScreen
 *     does `webViewPages[key] || webViewPages.fomema`, so tapping Train
 *     would quietly open the FOMEMA status page instead;
 *   - a tile whose kind maps to setScreen('x') where App.js renders no 'x'
 *     opens a blank page (audit-navigation covers that half).
 *
 * This resolves every tile in every grid and fails on any that lands nowhere
 * or somewhere else. It reads the kind table out of useServiceAction rather
 * than keeping its own copy, so adding a kind cannot silently bypass it.
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const parse = (rel) => parser.parse(read(rel), { sourceType: 'module', plugins: ['jsx'] });

function declarations(rel, names) {
  const out = {};
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'VariableDeclarator' && names.includes(n.id && n.id.name)) out[n.id.name] = n.init;
    for (const k of Object.keys(n)) { if (k === 'loc') continue; walk(n[k]); }
  };
  walk(parse(rel).program.body);
  return out;
}

const prop = (o, k) => {
  const p = o.properties && o.properties.find((x) => x.key && (x.key.name === k || x.key.value === k));
  return p ? p.value : undefined;
};
const val = (o, k) => { const v = prop(o, k); return v && v.value; };

/** Flatten a tile array, following spreads into the tables they name. */
function tiles(node, env, where, out = []) {
  if (!node) return out;
  if (node.type === 'ArrayExpression') {
    for (const el of node.elements) {
      if (!el) continue;
      if (el.type === 'SpreadElement') { tiles(env[el.argument.name], env, where, out); continue; }
      if (el.type !== 'ObjectExpression') continue;
      out.push({
        where,
        key: val(el, 'key'),
        name: val(el, 'name') || val(el, 'label') || val(el, 'key'),
        kind: val(el, 'kind'),
        screen: val(el, 'screen'),
        section: val(el, 'section'),
        // `service` is a nested { key, kind } on the admin landing, and a
        // plain key elsewhere. Normalise to one shape.
        service: (() => {
          const sv = prop(el, 'service');
          if (!sv) return undefined;
          if (sv.type === 'ObjectExpression') return { key: val(sv, 'key'), kind: val(sv, 'kind') };
          return { key: sv.value };
        })(),
      });
    }
    return out;
  }
  if (node.type === 'ObjectExpression') {
    for (const p of node.properties) {
      if (p.type !== 'ObjectProperty') continue;
      tiles(p.value, env, `${where}.${p.key.name || p.key.value}`, out);
    }
  }
  return out;
}

// ---- what the app can actually open ----
const app = read('App.js');
const screens = new Set([...app.matchAll(/renderedScreen === '([a-zA-Z]+)'/g)].map((m) => m[1]));
const steps = new Set(
  [...read('src/screens/ServiceScreen.js')
    .slice(read('src/screens/ServiceScreen.js').indexOf('const STEP_COMPONENTS = {'))
    .matchAll(/^  ([a-zA-Z]+):/gm)].map((m) => m[1]),
);
const webviews = new Set(
  [...read('src/data/countries.js')
    .slice(read('src/data/countries.js').indexOf('export const webViewPages = {'))
    .matchAll(/^  '?([a-zA-Z-]+)'?:\s*\{\s*url:/gm)].map((m) => m[1]),
);
const adminTabs = new Set([...read('src/screens/AdminHomeScreen.js').matchAll(/adminTab === '([a-zA-Z]+)'/g)].map((m) => m[1]));

// The kind table, read from useServiceAction so it cannot drift from it.
const action = read('src/components/ServiceGrid.js');
const actionBody = action.slice(action.indexOf('export function useServiceAction()'));
const handled = new Map();
for (const m of actionBody.matchAll(/if \(s\.kind === '([a-zA-Z]+)'\)\s*(?:\{\s*)?return ([a-zA-Z]+)\((?:'([a-zA-Z]+)')?/g)) {
  handled.set(m[1], { fn: m[2], arg: m[3] });
}
for (const m of actionBody.matchAll(/if \(s\.kind === '([a-zA-Z]+)'\) \{ [^}]*return setScreen\('([a-zA-Z]+)'\)/g)) {
  handled.set(m[1], { fn: 'setScreen', arg: m[2] });
}

const problems = [];
const note = (t, why) => problems.push(`${t.where}: "${t.name}" (key ${t.key}, kind ${t.kind || '-'}) ${why}`);

function checkTile(t) {
  // AdminFeaturesScreen rows declare a destination directly.
  if (t.section) return;
  if (t.screen) {
    if (!screens.has(t.screen)) note(t, `-> screen '${t.screen}', which App.js does not render`);
    return;
  }
  if (t.service) {
    // The tile delegates to a service row; check that row the same way.
    checkTile({ ...t, kind: t.service.kind, key: t.service.key, service: undefined, screen: undefined });
    return;
  }
  if (!t.kind) { note(t, 'has no kind, screen, section or service - nothing decides what it opens'); return; }

  if (t.kind === 'webview') {
    // The silent one: an unknown key opens FOMEMA rather than failing.
    if (!webviews.has(t.key)) note(t, `-> webview '${t.key}', which is not in webViewPages (it would open FOMEMA instead)`);
    return;
  }
  const h = handled.get(t.kind);
  if (!h) {
    // Unhandled kinds fall through to startService(key).
    if (!steps.has(t.key)) note(t, 'falls through to startService, but ServiceScreen has no step for that key');
    return;
  }
  if (h.fn === 'setScreen' && h.arg && !screens.has(h.arg)) {
    note(t, `-> setScreen('${h.arg}'), which App.js does not render`);
  }
}

// ---- every grid ----
const sg = declarations('src/components/ServiceGrid.js',
  ['CUSTOMER_SERVICES', 'SHARED_SERVICES', 'STAFF_SERVICES', 'STAFF_CAPABILITY_TILES']);
const all = [];
all.push(...tiles(sg.CUSTOMER_SERVICES, sg, 'customer grid'));
all.push(...tiles(sg.STAFF_SERVICES, sg, 'staff grid'));
all.push(...tiles(sg.STAFF_CAPABILITY_TILES, sg, 'support/finance grid'));

const af = declarations('src/screens/AdminFeaturesScreen.js',
  ['ADMIN_HOME', 'OPERATIONS', 'FINANCE', 'USERS', 'SYSTEM']);
all.push(...tiles(af.ADMIN_HOME, af, 'admin landing'));
for (const s of ['OPERATIONS', 'FINANCE', 'USERS', 'SYSTEM']) {
  for (const t of tiles(af[s], af, `admin ${s.toLowerCase()}`)) {
    // Section rows open a screen or an AdminHomeScreen tab.
    if (!screens.has(t.key) && !adminTabs.has(t.key) && t.key !== 'rates' && t.key !== 'apiManagement') {
      note(t, 'is neither a screen App.js renders nor a tab AdminHomeScreen has');
    }
  }
}

const mf = declarations('src/screens/MoreFeaturesScreen.js', ['PERSONAL_FEATURES', 'STAFF_FEATURES']);
all.push(...tiles(mf.PERSONAL_FEATURES, mf, 'more > personal'));
all.push(...tiles(mf.STAFF_FEATURES, mf, 'more > staff'));

if (!all.length) {
  console.error('Tile destination audit: found no tiles - the patterns have gone stale.');
  process.exit(1);
}
all.forEach(checkTile);

if (problems.length) {
  console.error(`\nTile destination audit: ${problems.length} tile(s) do not go where they say:\n`);
  problems.forEach((p) => console.error(`  ${p}`));
  console.error('');
  process.exit(1);
}
console.log(`Tile destination audit: all ${all.length} tile(s) resolve to something real.`);
