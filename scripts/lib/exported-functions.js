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
const ENTRYPOINT = path.join(FUNCTIONS_DIR, 'index.js');

/** Every `exports.name = ...` in index.js, mapped to the module behind it. */
function exportedFunctions() {
  const src = fs.readFileSync(ENTRYPOINT, 'utf8');

  // The `const alias = require(...)` form - index.js uses both this and the
  // inline form, so resolving aliases is not optional.
  const aliases = new Map();
  for (const m of src.matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*require\('\.\/([\w.-]+)'\)/gm)) {
    aliases.set(m[1], m[2].replace(/\.js$/, ''));
  }

  const out = new Map();
  for (const m of src.matchAll(/^exports\.([A-Za-z_$][\w$]*)\s*=\s*([^;]+);/gm)) {
    const [, name, rhs] = m;
    const inline = rhs.match(/require\('\.\/([\w.-]+)'\)/);
    if (inline) { out.set(name, inline[1].replace(/\.js$/, '')); continue; }
    const viaAlias = rhs.match(/^\s*([A-Za-z_$][\w$]*)\s*\./);
    if (viaAlias && aliases.has(viaAlias[1])) { out.set(name, aliases.get(viaAlias[1])); continue; }
    out.set(name, null); // defined inline in index.js; it ships with everything
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
