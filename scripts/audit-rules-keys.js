#!/usr/bin/env node
/**
 * firestore.rules pins some documents to an explicit key allowlist with
 * hasOnly([...]). That is the right call - it stops a compromised client
 * writing junk into a settings document - but it means the rule carries a
 * copy of a list that lives in JavaScript, and nothing keeps the two in
 * step. Drift is silent in the worst direction: the screen shows a toggle,
 * the write is rejected, and the feature looks broken for no visible reason.
 *
 * That already happened. settings/gridManagement allowed 'businessProfile'
 * on create and not on update, so toggling My Business on an existing
 * document failed with permission-denied.
 *
 * This compares each allowlist against the list the app actually writes.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const rules = read('firestore.rules');

/** The hasOnly([...]) allowlists on a rule line, as arrays of key names. */
function allowlists(docPath) {
  const line = rules.split('\n').find((l) => l.includes(`match /${docPath} `) || l.includes(`match /${docPath}{`));
  if (!line) return null;
  return [...line.matchAll(/hasOnly\(\[([^\]]+)\]\)/g)]
    .map((m) => m[1].split(',').map((k) => k.trim().replace(/'/g, '')).filter(Boolean));
}

const problems = [];

function compare(label, docPath, expected, always = []) {
  const lists = allowlists(docPath);
  if (!lists || !lists.length) {
    problems.push(`${docPath}: no hasOnly() allowlist found - has the rule been rewritten?`);
    return;
  }
  const want = new Set([...expected, ...always]);
  lists.forEach((got, i) => {
    const which = lists.length > 1 ? ['create', 'update'][i] || `list ${i + 1}` : 'allowlist';
    const missing = [...want].filter((k) => !got.includes(k));
    const extra = got.filter((k) => !want.has(k));
    if (missing.length) problems.push(`${docPath} (${which}): ${label} has ${missing.join(', ')}, the rule does not - those writes are rejected`);
    if (extra.length) problems.push(`${docPath} (${which}): the rule allows ${extra.join(', ')}, which ${label} no longer writes`);
  });
}

// settings/gridManagement <- GRID_DEFS
const grid = read('src/firebase/gridManagementService.js');
const gridBody = grid.slice(grid.indexOf('export const GRID_DEFS'), grid.indexOf('].map('));
// The scoped override maps are not tiles, so they come from GRID_SCOPES
// rather than GRID_DEFS - read from the service so the two cannot drift.
const gridScopes = [...(grid.match(/export const GRID_SCOPES = \[([^\]]*)\]/)?.[1] || '').matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);
if (!gridScopes.length) problems.push('gridManagementService: GRID_SCOPES not found, so the rule allowlist cannot be checked against it');
compare('GRID_DEFS', 'settings/gridManagement',
  [...gridBody.matchAll(/\['([a-zA-Z]+)','/g)].map((m) => m[1]), [...gridScopes, 'updatedAt']);

// settings/featureAccess <- FEATURE_DEFS, plus the per-user override bag
const fa = read('src/firebase/featureAccessService.js');
const faBody = fa.slice(fa.indexOf('export const FEATURE_DEFS'), fa.indexOf('export const TOGGLEABLE_ROLES'));
compare('FEATURE_DEFS', 'settings/featureAccess',
  [...faBody.matchAll(/\{ key: '([a-zA-Z]+)'/g)].map((m) => m[1]), ['userOverrides', 'updatedAt']);

if (problems.length) {
  console.error(`\nRules key audit: ${problems.length} mismatch(es) between firestore.rules and the app:\n`);
  problems.forEach((p) => console.error(`  ${p}`));
  console.error('\nA key the app writes but the rule omits is a silent permission-denied.\n');
  process.exit(1);
}
console.log('Rules key audit: every hasOnly() allowlist matches what the app writes.');
