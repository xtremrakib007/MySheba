#!/usr/bin/env node
/**
 * Every callable the clients name must exist in the backend.
 *
 * `httpsCallable(functions, 'doThing')` is a string. Nothing checks it, so a
 * rename on one side, or a function that was planned and never written, only
 * shows up as a failure in someone's hands - and the Firebase SDK's message
 * for it is close to useless. When the response carries no JSON error body the
 * SDK falls back to the bare status name (see _errorForResponse in
 * @firebase/functions: `${description} [${httpStatus}]`), so a missing
 * callable reads as "not-found [404]" and an unhealthy deployment reads as
 * "unavailable [503]". Neither says which call it was.
 *
 * This compares the names the clients ask for against what the functions
 * entrypoint actually exports. It is a static check: it says the name exists
 * in this repo's backend, not that the deployed revision has it. A deployment
 * that is stale or unhealthy still needs `firebase functions:log`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/**
 * Names the clients call that the backend does not define.
 *
 * These are real gaps, recorded rather than hidden so the check can gate new
 * drift. Removing one means either writing the function or deleting the call.
 */
const KNOWN_MISSING = {};

// Clients that call into the backend. Both are shipped to real people.
const CLIENT_ROOTS = ['src', 'admin-web/src'];

const CALLABLE = /httpsCallable\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*(["'`])([^"'`]+)\1/g;
// A name built at runtime cannot be checked, but it should be visible.
// The \s* belongs INSIDE the lookahead: written as `,\s*(?!["'`])` the \s*
// happily matches zero characters so the lookahead lands on the space before
// the quote, and every ordinary quoted call reads as dynamic.
const DYNAMIC = /httpsCallable\s*\(\s*[A-Za-z_$][\w$]*\s*,(?!\s*["'`])/g;

function walk(dir, onFile) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, onFile);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) onFile(full);
  }
}

// The entrypoint is whatever functions/package.json says, which is NOT
// index.js here: secureIndexV2.js requires index.js, attaches the guarded
// callables onto it and re-exports. Reading index.js alone misses 2 of them.
const functionsPkg = require(path.join(ROOT, 'functions', 'package.json'));
const entry = path.join(ROOT, 'functions', functionsPkg.main || 'index.js');

let exported;
try {
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'audit-callables';
  exported = new Set(Object.keys(require(entry)));
} catch (err) {
  console.error(`FAIL could not load the functions entrypoint (${path.relative(ROOT, entry)}): ${err.message}`);
  process.exit(1);
}

const referenced = new Map(); // name -> [files]
const dynamic = [];

for (const rootDir of CLIENT_ROOTS) {
  walk(path.join(ROOT, rootDir), (file) => {
    const source = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    for (const match of source.matchAll(CALLABLE)) {
      const name = match[2];
      if (!referenced.has(name)) referenced.set(name, []);
      referenced.get(name).push(rel);
    }
    if (DYNAMIC.test(source)) dynamic.push(rel);
    DYNAMIC.lastIndex = 0;
  });
}

console.log(
  `\n${path.relative(ROOT, entry)} exports ${exported.size} functions; ` +
    `clients reference ${referenced.size} callables.`
);

const missing = [];
const expectedMissingSeen = new Set();

for (const [name, files] of [...referenced].sort()) {
  if (exported.has(name)) continue;
  if (KNOWN_MISSING[name]) {
    expectedMissingSeen.add(name);
    continue;
  }
  missing.push([name, files]);
}

if (dynamic.length) {
  console.log(`\nCallable names built at runtime (not checkable here):`);
  for (const file of [...new Set(dynamic)]) console.log(`  - ${file}`);
}

const recorded = Object.keys(KNOWN_MISSING);
if (expectedMissingSeen.size) {
  console.log(`\nKnown gaps (recorded in scripts/audit-callables.js, still broken at runtime):`);
  for (const name of [...expectedMissingSeen].sort()) {
    console.log(`  - ${name}: ${KNOWN_MISSING[name]}`);
  }
}

// A recorded gap that nobody calls any more is stale: the entry should go,
// or it is quietly excusing a name that no longer exists.
const stale = recorded.filter((name) => !referenced.has(name) || exported.has(name));
if (stale.length) {
  console.log(`\nStale entries in KNOWN_MISSING (delete them):`);
  for (const name of stale) console.log(`  - ${name}`);
}

if (missing.length) {
  console.error(`\n${missing.length} callable(s) the clients call do not exist in the backend:`);
  for (const [name, files] of missing) {
    console.error(`\n  ${name}`);
    for (const file of files) console.error(`      called from ${file}`);
  }
  console.error(
    `\nEach of these fails at runtime as "not-found [404]" with no indication of which call it was.`
  );
  console.error(`Write the function, fix the name, or record it in KNOWN_MISSING with why.`);
  process.exit(1);
}

console.log(`\nEvery callable the clients name exists in the backend.`);
if (recorded.length) {
  console.log(`(${expectedMissingSeen.size} known gap(s) still outstanding - see above.)`);
}
