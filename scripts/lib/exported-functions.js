'use strict';
/**
 * What functions/index.js actually exports, and which module each one runs.
 *
 * A deploy filter is a list of strings. Firebase only discovers a bad name
 * after analysing the source and uploading the bundle, and then rejects the
 * whole batch - so a single typo costs a two-minute round trip and deploys
 * nothing. `executeConfiguredApi` cost three of them: it is an internal
 * helper in apiProviderService.js and was never a deployable function at all.
 *
 * Reading the entrypoint answers that in milliseconds, and answers a second
 * question the filter cannot: which functions carry a given module. A partial
 * deploy updates only the functions named; every other function keeps running
 * the bundle it was last deployed with. So fixing apiProviderService.js and
 * deploying only saveApiProvider leaves the charge path - the code that
 * actually dispatches a recharge - running yesterday's copy.
 */
const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = path.join(__dirname, '..', '..', 'functions');

/**
 * The deployed entrypoint, which is NOT index.js.
 *
 * functions/package.json names secureIndexV2.js: it requires index.js,
 * overwrites the charge callables with their guarded versions and attaches
 * about thirty more - walletTransfer, the topup reviews, the salary mutations.
 * Reading index.js alone reports every one of those as undeployable, which is
 * how a correct `deploy:functions walletTransfer` was refused.
 */
function entryChain() {
  const pkg = JSON.parse(fs.readFileSync(path.join(FUNCTIONS_DIR, 'package.json'), 'utf8'));
  const main = (pkg.main || 'index.js').replace(/\.js$/, '');
  const chain = [];
  const seen = new Set();
  const visit = (mod) => {
    if (seen.has(mod)) return;
    seen.add(mod);
    const file = path.join(FUNCTIONS_DIR, `${mod}.js`);
    if (!fs.existsSync(file)) return;
    const src = fs.readFileSync(file, 'utf8');
    // An entrypoint that re-exports another one must be read after it, so its
    // own bindings win.
    for (const m of src.matchAll(/^const\s+[A-Za-z_$][\w$]*\s*=\s*require\('\.\/(index|secureIndexV2)'\)/gm)) {
      visit(m[1]);
    }
    chain.push({ mod, src });
  };
  visit(main);
  return chain;
}

/** Every callable the entrypoint exposes, mapped to the module behind it. */
function exportedFunctions() {
  const out = new Map();
  for (const { src } of entryChain()) {
    const aliases = new Map();
    for (const m of src.matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*require\('\.\/([\w.-]+)'\)/gm)) {
      aliases.set(m[1], m[2].replace(/\.js$/, ''));
    }
    // `exports.name =` in index.js, and `functions.name =` in secureIndexV2,
    // where `functions` is whatever local holds the required index.
    const holders = ['exports'];
    for (const m of src.matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*require\('\.\/(?:index|secureIndexV2)'\)/gm)) {
      holders.push(m[1]);
    }
    const assignment = new RegExp(`^(?:${holders.join('|')})\\.([A-Za-z_$][\\w$]*)\\s*=\\s*([^;]+);`, 'gm');
    for (const m of src.matchAll(assignment)) {
      const [, name, rhs] = m;
      const inline = rhs.match(/require\('\.\/([\w.-]+)'\)/);
      if (inline) { out.set(name, inline[1].replace(/\.js$/, '')); continue; }
      const viaAlias = rhs.match(/^\s*([A-Za-z_$][\w$]*)\s*\./);
      if (viaAlias && aliases.has(viaAlias[1])) { out.set(name, aliases.get(viaAlias[1])); continue; }
      out.set(name, null); // defined inline; it ships with everything
    }
  }
  return out;
}

/** Local modules `mod` pulls in, directly or through others. */
function moduleClosure(mod, seen = new Set()) {
  if (!mod || seen.has(mod)) return seen;
  seen.add(mod);
  const file = path.join(FUNCTIONS_DIR, `${mod}.js`);
  if (!fs.existsSync(file)) return seen;
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/require\('\.\/([\w.-]+)'\)/g)) {
    moduleClosure(m[1].replace(/\.js$/, ''), seen);
  }
  return seen;
}

/**
 * The functions that would run stale code if `modules` changed and they were
 * left out of the deploy.
 */
function functionsDependingOn(modules) {
  const wanted = Array.isArray(modules) ? modules : [modules];
  const names = [];
  for (const [name, mod] of exportedFunctions()) {
    if (!mod) continue;
    const closure = moduleClosure(mod);
    if (wanted.some((w) => closure.has(w))) names.push(name);
  }
  return names.sort();
}

/** Names that are not deployable functions, with the nearest real ones. */
function unknownNames(names) {
  const known = [...exportedFunctions().keys()];
  const lower = new Map(known.map((k) => [k.toLowerCase(), k]));
  return names.filter((n) => !known.includes(n)).map((n) => {
    const needle = n.toLowerCase();
    const near = known.filter((k) => {
      const h = k.toLowerCase();
      return h.includes(needle) || needle.includes(h);
    });
    return { name: n, suggestions: (lower.has(needle) ? [lower.get(needle)] : near).slice(0, 4) };
  });
}

/** Exit with a readable message rather than letting Firebase reject the batch. */
function assertDeployable(names) {
  const bad = unknownNames(names);
  if (!bad.length) return;
  console.error('\nThese are not deployable functions, so Firebase would reject the whole batch:\n');
  for (const { name, suggestions } of bad) {
    console.error(`  ${name}`);
    if (suggestions.length) console.error(`    did you mean: ${suggestions.join(', ')}`);
    else console.error('    no function of that name is exported from functions/index.js');
  }
  console.error('\nA name only deploys if functions/index.js exports it. An internal');
  console.error('helper (executeConfiguredApi, for one) never does.\n');
  process.exit(1);
}

module.exports = { exportedFunctions, moduleClosure, functionsDependingOn, unknownNames, assertDeployable };
