#!/usr/bin/env node
/**
 * Whole-repo wiring check. Run with `npm run audit:repo`.
 *
 * Each section targets a failure class that has actually shipped here: an
 * import left behind by a cleanup (twice made the app impossible to bundle),
 * a function deleted while its callers kept calling it, a callable the app
 * invokes that nothing deploys, and App Check demanded of a client that
 * cannot mint a token.
 *
 * Reads functions/secureIndexV2.js as well as functions/index.js, because
 * package.json points main at the former and it overrides names from the
 * latter - reading index.js alone reports a working callable as missing.
 *
 * Deliberately not wired into CI. It currently reports three functions the
 * screens call that exist nowhere (advertiser analytics, recharge-PIN
 * issuance), which are unbuilt features rather than wiring mistakes, and
 * gating a build on them would only teach people to ignore the gate.
 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const F = [], N = [];
const fail = (g, m) => F.push(`${g}: ${m}`);
const note = (g, m) => N.push(`${g}: ${m}`);

const EXTS = ['', '.js', '.jsx', '.ts', '.tsx', '.json', '/index.js'];
const resolve = (b) => { for (const e of EXTS) { try { if (fs.statSync(b + e).isFile()) return b + e; } catch {} } return null; };
const walk = (d, o = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.name === 'node_modules' || f.name.startsWith('.')) continue; const p = path.join(d, f.name); f.isDirectory() ? walk(p, o) : /\.jsx?$/.test(f.name) && o.push(p); } return o; };
const rel = (f) => path.relative(root, f);

const appFiles = walk(path.join(root, 'src')).concat([path.join(root, 'App.js'), path.join(root, 'index.js')].filter(fs.existsSync));
const fnFiles = fs.readdirSync(path.join(root, 'functions')).filter(f => f.endsWith('.js')).map(f => path.join(root, 'functions', f));
const scriptFiles = fs.existsSync(path.join(root, 'scripts')) ? fs.readdirSync(path.join(root, 'scripts')).filter(f => f.endsWith('.js')).map(f => path.join(root, 'scripts', f)) : [];

// comments and strings mention filenames constantly here
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ').replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, '``');

function exportsOf(src) {
  const n = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) n.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) n.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').forEach(x => { const t = x.trim().split(/\s+as\s+/); if (t[0]) n.add((t[1] || t[0]).trim()); });
  const cjs = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\}/);
  if (cjs) cjs[1].split(',').forEach(x => { const t = x.split(':')[0].trim(); if (/^[A-Za-z0-9_$]+$/.test(t)) n.add(t); });
  for (const m of src.matchAll(/(?:module\.)?exports\.([A-Za-z0-9_$]+)\s*=/g)) n.add(m[1]);
  if (/module\.exports\s*=\s*[A-Za-z0-9_$]+\s*;/.test(src) || /export\s+\*/.test(src)) n.add('*');
  if (/export\s+default/.test(src)) n.add('default');
  return n;
}

// 1. every relative import resolves — an unbuildable bundle
for (const f of [...appFiles, ...fnFiles, ...scriptFiles])
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"](\.[^'"]+)['"]/g))
    if (!resolve(path.resolve(path.dirname(f), m[1]))) fail('unresolved-import', `${rel(f)} -> '${m[1]}'`);

// 2. named imports exist in the target
for (const f of appFiles) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const t = resolve(path.resolve(path.dirname(f), m[2]));
    if (!t || t.endsWith('.json')) continue;
    const exp = exportsOf(fs.readFileSync(t, 'utf8'));
    if (exp.has('*')) continue;
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (name && name !== 'default' && !exp.has(name)) fail('missing-export', `${rel(f)} imports { ${name} } from '${m[2]}'`);
    }
  }
}

// 3. namespace members exist
for (const f of appFiles) {
  const src = fs.readFileSync(f, 'utf8'), clean = strip(src);
  for (const m of src.matchAll(/import\s*\*\s*as\s+([A-Za-z0-9_$]+)\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const t = resolve(path.resolve(path.dirname(f), m[2]));
    if (!t) continue;
    const exp = exportsOf(fs.readFileSync(t, 'utf8'));
    if (exp.has('*')) continue;
    for (const u of new Set([...clean.matchAll(new RegExp(`\\b${m[1]}\\.([A-Za-z0-9_$]+)`, 'g'))].map(x => x[1])))
      if (!exp.has(u)) fail('missing-member', `${rel(f)} calls ${m[1]}.${u}, '${m[2]}' does not export it`);
  }
}

// 4. callables the app invokes are exported by functions/index.js
// functions/package.json points main at secureIndexV2.js, which requires
// ./index and then overrides some names. Reading index.js alone reports a
// working callable as missing.
const idx = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const entry = fs.existsSync(path.join(root, 'functions/secureIndexV2.js')) ? fs.readFileSync(path.join(root, 'functions/secureIndexV2.js'), 'utf8') : '';
const deployed = new Set([
  ...[...idx.matchAll(/exports\.([A-Za-z0-9_$]+)\s*=/g)].map(m => m[1]),
  ...[...entry.matchAll(/(?:exports|functions)\.([A-Za-z0-9_$]+)\s*=/g)].map(m => m[1]),
]);
const called = new Map();
for (const f of appFiles) for (const m of fs.readFileSync(f, 'utf8').matchAll(/httpsCallable\(\s*functions\s*,\s*['"]([A-Za-z0-9_$]+)['"]/g)) if (!called.has(m[1])) called.set(m[1], rel(f));
for (const [n, w] of called) if (!deployed.has(n)) fail('missing-callable', `${w} calls '${n}', functions/index.js does not export it`);

// 5. functions/index.js wiring
const seen = new Set();
for (const m of idx.matchAll(/exports\.([A-Za-z0-9_$]+)\s*=\s*require\(['"](\.[^'"]+)['"]\)(?:\.([A-Za-z0-9_$]+))?/g)) {
  const [, name, spec, member] = m;
  if (seen.has(name)) fail('duplicate-export', `functions/index.js exports '${name}' twice`);
  seen.add(name);
  const t = resolve(path.resolve(path.join(root, 'functions'), spec));
  if (!t) { fail('unresolved-import', `functions/index.js -> '${spec}'`); continue; }
  if (member && !new RegExp(`exports\\.${member}\\s*=`).test(fs.readFileSync(t, 'utf8')))
    fail('missing-member', `functions/index.js reads .${member} from '${spec}', not set there`);
}

// 6. App Check: the client mints no token, so nothing may demand one
const fnAll = fnFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const hasSdk = appFiles.some(f => /app-?check/i.test(fs.readFileSync(f, 'utf8')));
const hard = (fnAll.match(/enforceAppCheck:\s*true/g) || []).length;
if (hard && !hasSdk) fail('app-check', `${hard} callable(s) enforce App Check but the client has no App Check SDK`);

// 7. orphans
for (const dir of ['src/components', 'src/screens']) {
  const reach = new Set();
  const w = (f) => { if (reach.has(f) || !/\.jsx?$/.test(f)) return; reach.add(f); for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"](\.[^'"]+)['"]/g)) { const t = resolve(path.resolve(path.dirname(f), m[1])); if (t) w(t); } };
  w(path.join(root, 'index.js'));
  for (const f of fs.readdirSync(path.join(root, dir))) if (f.endsWith('.js') && !reach.has(path.join(root, dir, f))) note('orphan', `${dir}/${f}`);
}

const out = (t, a) => { if (a.length) { console.log(`\n${t} (${a.length}):`); a.forEach(x => console.log('  ' + x)); } };
out('FAILURES', F); out('NOTES', N);
console.log(F.length ? `\n${F.length} failure(s)` : '\nno failures');
process.exit(F.length ? 1 : 0);
