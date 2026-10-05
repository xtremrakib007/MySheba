#!/usr/bin/env node
'use strict';
/**
 * Whether a push was actually delivered, and saying so when it was not.
 *
 * Expo answers HTTP 200 and puts the real outcome in the body, one ticket per
 * message. Both copies of the sender - there were two, in announcements.js and
 * index.js - checked only res.ok. So an entire broadcast could fail and the
 * admin was told it had been "sent to 50": the count was of messages composed,
 * not messages delivered, and the reasons were discarded.
 *
 * That is the failure this covers. Not whether a push arrives - no test here
 * can know that - but whether the system is honest about it when one does not.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { sendExpoPush, describePush } = require('../functions/expoPush');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed += 1; console.log('  ok  ' + name); })
    .catch((error) => { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; });
}

// Expo is stubbed, because the point is how its answers are read.
const realFetch = globalThis.fetch;
function stubFetch(handler) { globalThis.fetch = handler; }
function restoreFetch() { globalThis.fetch = realFetch; }
const ok = (tickets) => async () => ({ ok: true, status: 200, json: async () => ({ data: tickets }), text: async () => '' });

const msg = (to) => ({ to, title: 't', body: 'b' });

(async () => {
  console.log('\nReading what Expo actually said');

  await test('all delivered', async () => {
    stubFetch(ok([{ status: 'ok', id: '1' }, { status: 'ok', id: '2' }]));
    const out = await sendExpoPush([msg('a'), msg('b')]);
    assert.deepStrictEqual([out.attempted, out.accepted, out.failed], [2, 2, 0]);
    restoreFetch();
  });

  await test('a 200 full of errors is not a success', async () => {
    // The original bug, exactly: HTTP 200, every message rejected.
    stubFetch(ok([
      { status: 'error', message: 'x', details: { error: 'MismatchSenderId' } },
      { status: 'error', message: 'x', details: { error: 'MismatchSenderId' } },
    ]));
    const out = await sendExpoPush([msg('a'), msg('b')]);
    assert.strictEqual(out.accepted, 0, 'nothing was delivered');
    assert.strictEqual(out.failed, 2);
    assert.deepStrictEqual(out.errors, { MismatchSenderId: 2 });
    restoreFetch();
  });

  await test('mixed results are counted apart', async () => {
    stubFetch(ok([
      { status: 'ok', id: '1' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', details: { error: 'InvalidCredentials' } },
    ]));
    const out = await sendExpoPush([msg('a'), msg('b'), msg('c')]);
    assert.strictEqual(out.accepted, 1);
    assert.strictEqual(out.failed, 2);
    assert.deepStrictEqual(out.errors, { DeviceNotRegistered: 1, InvalidCredentials: 1 });
    restoreFetch();
  });

  await test('a dead install comes back so its token can be cleared', async () => {
    // The documented remedy for DeviceNotRegistered is to stop sending to the
    // token. Without this it fails on every broadcast, for ever.
    stubFetch(ok([{ status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'ok' }]));
    const out = await sendExpoPush([msg('dead'), msg('live')]);
    assert.deepStrictEqual(out.unregistered, ['dead']);
    restoreFetch();
  });

  await test('only DeviceNotRegistered is treated as a dead token', async () => {
    // Clearing a token on MismatchSenderId would delete every Android token in
    // the system over a credentials mistake that is fixed in a dashboard.
    stubFetch(ok([{ status: 'error', details: { error: 'MismatchSenderId' } }]));
    const out = await sendExpoPush([msg('a')]);
    assert.deepStrictEqual(out.unregistered, []);
    restoreFetch();
  });

  console.log('\nWhen Expo says nothing useful');

  await test('a non-200 fails every message in the batch', async () => {
    stubFetch(async () => ({ ok: false, status: 503, text: async () => 'busy', json: async () => ({}) }));
    const out = await sendExpoPush([msg('a'), msg('b')]);
    assert.strictEqual(out.accepted, 0);
    assert.deepStrictEqual(out.errors, { HTTP503: 2 });
    restoreFetch();
  });

  await test('a network failure is a failure, not a silent success', async () => {
    stubFetch(async () => { throw new Error('offline'); });
    const out = await sendExpoPush([msg('a')]);
    assert.strictEqual(out.accepted, 0);
    assert.deepStrictEqual(out.errors, { NetworkError: 1 });
    restoreFetch();
  });

  await test('a 200 that cannot be parsed is not evidence of delivery', async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => { throw new Error('nope'); }, text: async () => '' }));
    const out = await sendExpoPush([msg('a')]);
    assert.strictEqual(out.accepted, 0);
    assert.deepStrictEqual(out.errors, { UnreadableResponse: 1 });
    restoreFetch();
  });

  await test('a short ticket list does not quietly pass the rest', async () => {
    stubFetch(ok([{ status: 'ok' }]));
    const out = await sendExpoPush([msg('a'), msg('b')]);
    assert.strictEqual(out.accepted, 1);
    assert.strictEqual(out.failed, 1, 'the message with no ticket must not count as delivered');
    restoreFetch();
  });

  await test('nothing to send touches the network at all', async () => {
    let called = false;
    stubFetch(async () => { called = true; return ok([])(); });
    const out = await sendExpoPush([]);
    assert.strictEqual(called, false);
    assert.deepStrictEqual([out.attempted, out.accepted, out.failed], [0, 0, 0]);
    restoreFetch();
  });

  console.log('\nSaying it in words an admin can act on');

  await test('it names the count and the reasons', async () => {
    assert.ok(/no eligible device had a push token/.test(describePush({ attempted: 0 })));
    assert.strictEqual(describePush({ attempted: 2, accepted: 2, failed: 0, errors: {} }), 'Delivered to 2 of 2.');
    const bad = describePush({ attempted: 2, accepted: 0, failed: 2, errors: { MismatchSenderId: 2 } });
    assert.ok(/Delivered to 0 of 2/.test(bad), bad);
    assert.ok(/MismatchSenderId 2/.test(bad), bad);
  });

  console.log('\nOne sender, used by both callers');

  await test('neither file keeps a copy of its own', async () => {
    for (const file of ['functions/announcements.js', 'functions/index.js']) {
      const src = read(file);
      assert.ok(!/async function sendExpoPush/.test(src), file + ' still defines its own sender');
      assert.ok(/require\('\.\/expoPush'\)/.test(src), file + ' does not use the shared one');
    }
  });

  await test('the broadcast reports delivery, not composition', async () => {
    const src = read('functions/announcements.js');
    assert.ok(/const push=await sendExpoPush\(messages\);/.test(src), 'the summary must be captured');
    assert.ok(/deliveredCount:push\.accepted/.test(src), 'the result must carry what was delivered');
    assert.ok(/failedCount:push\.failed/.test(src), 'and what failed');
    assert.ok(/pushErrors:push\.errors/.test(src), 'and why');
    assert.ok(/delivery:describePush\(push\)/.test(src), 'in words, for whoever pressed send');
    // The old count stays too - it is still the honest answer to "how many
    // devices were eligible" - but it is no longer the only number shown.
    assert.ok(/sentCount:messages\.length/.test(src));
  });

  await test('dead tokens are cleared, and only those', async () => {
    const src = read('functions/announcements.js');
    assert.ok(/push\.unregistered\.length/.test(src), 'dead tokens must be acted on');
    assert.ok(/pushToken:admin\.firestore\.FieldValue\.delete\(\)/.test(src), 'and the token removed');
    assert.ok(/pushTokenClearedReason:'DeviceNotRegistered'/.test(src), 'with the reason recorded');
  });

  console.log('\n' + passed + ' checks passed.\n');
})();
