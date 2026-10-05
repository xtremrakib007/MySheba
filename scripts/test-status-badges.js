#!/usr/bin/env node
'use strict';
/**
 * The badge that took the app down.
 *
 * A recharge that fails is written `status: 'failed'` by the server. None of
 * the four hand-kept badge tables had that word in it, and two of them looked
 * the status up with no fallback - so `undefined.bg` threw inside a .map(),
 * and the admin home screen became "Something went wrong" for everybody whose
 * queue contained one failed order.
 *
 * The fix is one table and a function. These checks are about the two
 * properties that matter: it covers what the server actually writes, and it
 * cannot return undefined for anything at all.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { STATUS_BADGES, statusBadge, statusLabel } = require('../src/theme/statusBadges.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

console.log('\nEvery status the server writes has a badge');

test('the statuses a transaction can hold are all covered', () => {
  // The crash was 'failed'. The rest are here so the next one is not a
  // different word with the same ending.
  for (const status of ['pending', 'accepted', 'processing', 'completed', 'failed', 'rejected', 'unknown']) {
    assert.ok(STATUS_BADGES[status], status + ' has no badge, and a transaction can hold it');
  }
});

test('and so are top-ups, inquiries and support tickets', () => {
  for (const status of ['verified', 'approved', 'new', 'contacted', 'closed', 'open', 'in_progress', 'resolved']) {
    assert.ok(STATUS_BADGES[status], status + ' has no badge');
  }
});

test('the table is read from functions/, not from memory', () => {
  // If the server starts writing a new status, this is what should fail -
  // before somebody's home screen does.
  const written = new Set();
  for (const file of ['walletService.js', 'rechargePinService.js', 'apiWebhookService.js', 'transactionService.js', 'rejectionService.js', 'chargeGuards.js']) {
    const source = read(path.join('functions', file));
    for (const match of source.matchAll(/status: '([a-z_]+)'/g)) written.add(match[1]);
  }
  assert.ok(written.size >= 5, 'expected to find several statuses, saw ' + written.size);
  assert.ok(written.has('failed'), 'the sweep must be finding real statuses');
  for (const status of written) {
    assert.ok(STATUS_BADGES[status], `functions/ writes status '${status}' and no badge covers it`);
  }
});

console.log('\nAnd nothing can come back undefined');

test('an unexpected status gets a badge rather than a crash', () => {
  for (const bad of ['refunded', 'WHATEVER', '', null, undefined, 42, {}, []]) {
    const badge = statusBadge(bad);
    assert.ok(badge && typeof badge.bg === 'string' && typeof badge.text === 'string',
      JSON.stringify(bad) + ' returned something that cannot be rendered');
  }
});

test('case and whitespace do not decide whether the app crashes', () => {
  assert.deepStrictEqual(statusBadge(' FAILED '), STATUS_BADGES.failed);
  assert.deepStrictEqual(statusBadge('Completed'), STATUS_BADGES.completed);
});

test('a failed order does not read as a finished one', () => {
  // The colour is the whole message on a chip. Falling back to pending or
  // completed would be worse than the crash: it would be quietly wrong.
  assert.notDeepStrictEqual(STATUS_BADGES.failed, STATUS_BADGES.completed);
  assert.notDeepStrictEqual(STATUS_BADGES.failed, STATUS_BADGES.pending);
  assert.deepStrictEqual(STATUS_BADGES.failed, STATUS_BADGES.rejected, 'both ended badly and should read alike');
  assert.notDeepStrictEqual(statusBadge('something nobody planned for'), STATUS_BADGES.completed);
});

test('the label never throws on what the badge accepts', () => {
  // The line under the crash was tx.status.toUpperCase().
  for (const bad of [null, undefined, '', 42, {}, []]) {
    assert.strictEqual(typeof statusLabel(bad), 'string', JSON.stringify(bad) + ' broke the label');
  }
  assert.strictEqual(statusLabel('failed'), 'FAILED');
  assert.strictEqual(statusLabel(undefined), 'UNKNOWN');
  assert.strictEqual(statusLabel(undefined, 'NEW'), 'NEW', 'a screen may choose its own word for nothing');
});

console.log('\nOne table, and no way back to four');

test('no screen keeps a badge table of its own any more', () => {
  const files = ['src/screens/AdminHomeScreen.js', 'src/screens/DealerHomeScreen.js',
    'src/screens/ResellerHomeScreen.js', 'src/components/TransactionDetailModal.js'];
  for (const file of files) {
    const source = read(file);
    assert.ok(!/const BADGE_COLORS = \{/.test(source), file + ' still declares its own table');
    assert.ok(/from '\.\.\/theme\/statusBadges'/.test(source), file + ' must use the shared one');
  }
});

test('nowhere indexes the table directly', () => {
  // Indexing is what returned undefined. The function cannot.
  for (const file of ['src/screens/AdminHomeScreen.js', 'src/screens/DealerHomeScreen.js',
    'src/screens/ResellerHomeScreen.js', 'src/components/TransactionDetailModal.js']) {
    assert.ok(!/STATUS_BADGES\[/.test(read(file)), file + ' indexes the table instead of calling statusBadge');
  }
});

test('no screen calls toUpperCase on a status that might not be there', () => {
  // `(x || 'y').toUpperCase()` is safe and allowed; `x.status.toUpperCase()`
  // is the exact line that threw.
  for (const dir of ['src/screens', 'src/components', 'src/steps']) {
    for (const name of fs.readdirSync(path.join(ROOT, dir))) {
      if (!name.endsWith('.js')) continue;
      const source = read(path.join(dir, name));
      const bad = /(?<![)\s])\.status\.to(Upper|Lower)Case\(\)/.exec(source);
      assert.ok(!bad, `${dir}/${name} calls ${bad && bad[0]} on a status that may be missing`);
    }
  }
});

console.log('\n' + passed + ' checks passed.\n');
