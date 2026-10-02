#!/usr/bin/env node
'use strict';

/**
 * Reading `firebase functions:list` in whatever shape it arrives.
 *
 * The first version of audit-deployed-functions insisted on box-drawing pipes,
 * because that is what the table looks like in a terminal. Redirected to a file
 * it found nothing at all and said "No functions parsed" - useless, and the
 * person running it had done nothing wrong.
 *
 * The CLI's output is not a contract: it changes between versions, differs
 * between a TTY and a redirect, and can carry colour codes. So the parser takes
 * JSON first (the reliable input, via --json), then any table it can recognise,
 * and finds the runtime and region by their shape rather than by column number.
 * These are the shapes it has to survive.
 */
const path = require('path');

const { parseListing } = require(path.join(__dirname, 'audit-deployed-functions.js'));

let failed = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  ok   ${name}`);
  else { failed += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

function names(text) {
  return (parseListing(text) || []).map((r) => r.name).sort().join(',');
}

console.log('\nJSON, which is what --json gives');

check('the {status, result} wrapper', names(JSON.stringify({
  status: 'success',
  result: [
    { id: 'boostListing', region: 'us-central1', runtime: 'nodejs20' },
    { id: 'acceptTransaction', region: 'us-central1', runtime: 'nodejs22' },
  ],
})) === 'acceptTransaction,boostListing');

check('a bare array', names(JSON.stringify([
  { functionName: 'giftGamePoints', location: 'us-central1', runtime: 'nodejs20' },
])) === 'giftGamePoints');

check('a v2 resource path with a nested runtime', names(JSON.stringify({
  result: [{
    name: 'projects/p/locations/us-central1/functions/chargeGamePoints',
    region: 'us-central1',
    buildConfig: { runtime: 'nodejs20' },
  }],
})) === 'chargeGamePoints');

console.log('\nTables, in whatever the CLI printed');

check('box drawing', names([
  '┌──────────┬─────────┬──────────┐',
  '│ Function │ Version │ Runtime  │',
  '│ boostListing │ v2 │ callable │ us-central1 │ 256 │ nodejs20 │',
].join('\n')) === 'boostListing');

check('ascii pipes', names([
  '| Function | Version | Trigger | Location | Memory | Runtime |',
  '| createUserAccount | v2 | callable | us-central1 | 256 | nodejs20 |',
].join('\n')) === 'createUserAccount');

check('whitespace columns with no pipes at all', names([
  'Function              Version   Trigger    Location      Memory  Runtime',
  'generateAgoraToken    v2        callable   us-central1   256     nodejs20',
].join('\n')) === 'generateAgoraToken');

check('colour codes left in by a redirect',
  names('\u001b[1m| giftGamePoints | v2 | callable | us-central1 | 256 | nodejs20 |\u001b[0m') === 'giftGamePoints');

console.log('\nWhat must NOT be read as a function');

check('progress lines and headers are ignored', names([
  'i  functions: listing functions...',
  '',
  '| Function | Version | Trigger | Location | Memory | Runtime |',
  '| boostListing | v2 | callable | us-central1 | 256 | nodejs20 |',
  'Done.',
].join('\n')) === 'boostListing');

check('an empty file yields nothing', (parseListing('') || []).length === 0);
check('prose is not mistaken for a listing',
  (parseListing('Error: Failed to authenticate, have you run firebase login?') || []).length === 0);

console.log('\nFields are found by shape, not by position');
{
  const rows = parseListing('| chargeGamePoints | v2 | callable | asia-southeast1 | 256 | nodejs20 |') || [];
  const r = rows[0] || {};
  check('runtime', r.runtime === 'nodejs20', JSON.stringify(r));
  check('region', r.region === 'asia-southeast1', JSON.stringify(r));
  // A reordered table is exactly what breaks a column-index parser.
  const moved = parseListing('| chargeGamePoints | nodejs20 | asia-southeast1 | v2 | callable |') || [];
  check('still right when the columns move',
    moved[0]?.runtime === 'nodejs20' && moved[0]?.region === 'asia-southeast1', JSON.stringify(moved[0]));
}

console.log('');
if (failed) {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}
console.log('The deployment listing parses in every shape the CLI produces.');
