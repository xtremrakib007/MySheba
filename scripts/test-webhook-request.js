'use strict';

// Can we read a callback that arrives as a GET?
//
// iimmpact's dashboard says, in its own words, "We'll send transaction status
// updates to this endpoint using GET requests", and it refuses to save a
// callback URL that carries a query string. Both of those were fatal: the
// handler answered 405 to anything but POST, and the only URL we handed out
// was `...apiWebhook?providerId=<id>`, which their dashboard rejects with 400.
//
// So the two things worth proving are that the provider id survives a
// query-free URL, and that a body-less request still yields the transaction
// fields - including through the nested `data.` paths an iimmpact provider is
// already configured with, since nobody should have to re-enter those because
// a toggle moved.

const assert = require('assert');
const {
  pathProviderId, webhookProviderId, webhookPayload, webhookEndpointUrl, FUNCTION_NAME,
} = require('../functions/webhookRequest');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

// What a dotted path setting resolves to, the same way the handler reads it.
function pathGet(obj, path) {
  return path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
}

console.log('\nProvider id from the URL path');

test('a single segment is the provider id', () => {
  assert.strictEqual(pathProviderId('/abc123'), 'abc123');
});

test('the function name is stripped when the platform leaves it on', () => {
  assert.strictEqual(pathProviderId('/apiWebhook/abc123'), 'abc123');
});

test('the function name alone is not a provider id', () => {
  // Otherwise the bare URL would look up a provider called "apiWebhook"
  // instead of falling through to ?providerId=, breaking every webhook that
  // is still registered with the old form.
  assert.strictEqual(pathProviderId('/apiWebhook'), '');
  assert.strictEqual(pathProviderId('/apiWebhook/'), '');
});

test('an empty path carries no provider id', () => {
  assert.strictEqual(pathProviderId('/'), '');
  assert.strictEqual(pathProviderId(''), '');
  assert.strictEqual(pathProviderId(null), '');
  assert.strictEqual(pathProviderId(undefined), '');
});

test('a deeper path is refused rather than guessed at', () => {
  // Reading either end of /abc/def as the id would accept a URL we never
  // handed out and cannot vouch for.
  assert.strictEqual(pathProviderId('/abc/def'), '');
  assert.strictEqual(pathProviderId('/apiWebhook/abc/def'), '');
});

console.log('\nProvider id from a whole request');

test('the path form is read', () => {
  assert.strictEqual(webhookProviderId({ path: '/abc123', query: {} }), 'abc123');
});

test('the query form still works for webhooks already registered with it', () => {
  assert.strictEqual(webhookProviderId({ path: '/', query: { providerId: 'abc123' } }), 'abc123');
  assert.strictEqual(webhookProviderId({ path: '/apiWebhook', query: { providerId: 'abc123' } }), 'abc123');
});

test('the path wins when both are present', () => {
  // The provider appends its parameters to whatever we registered; if one of
  // them were ever called providerId it must not redirect the lookup.
  assert.strictEqual(webhookProviderId({ path: '/frompath', query: { providerId: 'fromquery' } }), 'frompath');
});

test('the id is trimmed and capped', () => {
  assert.strictEqual(webhookProviderId({ path: '/', query: { providerId: '  abc123  ' } }), 'abc123');
  assert.strictEqual(webhookProviderId({ path: '/', query: { providerId: 'x'.repeat(200) } }).length, 100);
});

test('a non-string id is not read', () => {
  assert.strictEqual(webhookProviderId({ path: '/', query: { providerId: { a: 1 } } }), '');
  assert.strictEqual(webhookProviderId({}), '');
  assert.strictEqual(webhookProviderId(undefined), '');
});

console.log('\nPayload from a POST');

test('a nested JSON body is passed through untouched', () => {
  // It already has `data`, so the mirror must leave it exactly as the provider
  // sent it - identity, not a copy with an invented `data`.
  const body = { data: { refid: 'TX1', status: 'Successful' } };
  assert.strictEqual(webhookPayload({ method: 'POST', body, query: {} }), body);
});

test('a flat POST body also resolves through the configured `data.` paths', () => {
  // A form-encoded POST arrives flat, like a GET does. Same mirror, so the
  // path settings do not have to change for it either.
  const payload = webhookPayload({
    method: 'POST',
    body: { refid: 'TX1', status: 'Succesful' },
    query: {},
  });
  assert.strictEqual(pathGet(payload, 'data.refid'), 'TX1');
  assert.strictEqual(pathGet(payload, 'refid'), 'TX1');
});

test('a POST body is preferred over the query string', () => {
  const payload = webhookPayload({
    method: 'POST',
    body: { data: { refid: 'FROMBODY' } },
    query: { refid: 'FROMQUERY' },
  });
  assert.strictEqual(pathGet(payload, 'data.refid'), 'FROMBODY');
});

test('an empty POST body falls back to the query string', () => {
  // Firebase hands us {} for a POST with no parseable body; the fields may
  // still be on the URL.
  const payload = webhookPayload({ method: 'POST', body: {}, query: { refid: 'TX1' } });
  assert.strictEqual(pathGet(payload, 'data.refid'), 'TX1');
});

test('a non-object body falls back to the query string', () => {
  for (const body of ['raw', ['a'], null, undefined, 7]) {
    const payload = webhookPayload({ method: 'POST', body, query: { refid: 'TX1' } });
    assert.strictEqual(pathGet(payload, 'refid'), 'TX1', 'body ' + JSON.stringify(body));
  }
});

console.log('\nPayload from a GET');

test('query parameters are the payload', () => {
  const payload = webhookPayload({ method: 'GET', query: { refid: 'TX1', status: 'Succesful' } });
  assert.strictEqual(pathGet(payload, 'refid'), 'TX1');
  assert.strictEqual(pathGet(payload, 'status'), 'Succesful');
});

test('the nested paths an iimmpact provider is configured with still resolve', () => {
  // transactionIdPath is `data.refid` because that is where their POST
  // callback puts it. Flipping their toggle to GET must not silently blank
  // every field and answer 400 "Missing transactionId or status".
  const payload = webhookPayload({
    method: 'GET',
    query: { refid: 'TX1', status: 'Succesful', message: 'Completed' },
  });
  assert.strictEqual(pathGet(payload, 'data.refid'), 'TX1');
  assert.strictEqual(pathGet(payload, 'data.status'), 'Succesful');
  assert.strictEqual(pathGet(payload, 'data.message'), 'Completed');
});

test('the cross-check reads a GET callback the same way', () => {
  // matchesCallbackRequest is handed pathGet(body, 'data'); on a GET that has
  // to be the mirror, or every callback is refused as a mismatch.
  const payload = webhookPayload({
    method: 'GET',
    query: { refid: 'TX1', status: 'Succesful', product: 'HI', account: '0178855286', amount: '40' },
  });
  const { matchesCallbackRequest } = require('../functions/callbackMatch');
  const sent = { product: 'HI', account: '0178855286', amount: 40 };
  assert.strictEqual(matchesCallbackRequest(pathGet(payload, 'data'), sent).ok, true);
  const wrong = { product: 'HI', account: '0178855286', amount: 99 };
  assert.strictEqual(matchesCallbackRequest(pathGet(payload, 'data'), wrong).ok, false);
});

test('our own providerId parameter is not part of the payload', () => {
  // It is our routing, not provider output, and it would otherwise be stored
  // as a callback field and hashed into the event key.
  const payload = webhookPayload({ method: 'GET', query: { providerId: 'abc123', refid: 'TX1' } });
  assert.strictEqual('providerId' in payload, false);
  assert.strictEqual('providerId' in payload.data, false);
  assert.strictEqual(pathGet(payload, 'data.refid'), 'TX1');
});

test('a repeated parameter keeps its last value', () => {
  // Express gives an array; an array reaching a status comparison matches
  // nothing, so the transaction would neither settle nor refund.
  const payload = webhookPayload({ method: 'GET', query: { status: ['Pending', 'Succesful'] } });
  assert.strictEqual(pathGet(payload, 'status'), 'Succesful');
  assert.strictEqual(pathGet(payload, 'data.status'), 'Succesful');
});

test("a real `data` parameter is not overwritten by the mirror", () => {
  const payload = webhookPayload({ method: 'GET', query: { data: 'provider-sent-this', refid: 'TX1' } });
  assert.strictEqual(payload.data, 'provider-sent-this');
  assert.strictEqual(payload.refid, 'TX1');
});

test('a GET with no parameters yields nothing to settle on', () => {
  // The handler must still reach its "Missing transactionId or status" 400
  // rather than throw.
  const payload = webhookPayload({ method: 'GET', query: {} });
  assert.strictEqual(pathGet(payload, 'data.refid'), undefined);
  assert.strictEqual(pathGet(payload, 'refid'), undefined);
});

test('a GET body is ignored', () => {
  // Nothing should be settled on a body smuggled into a GET when the
  // provider's own fields are on the URL.
  const payload = webhookPayload({ method: 'GET', body: { data: { refid: 'FROMBODY' } }, query: { refid: 'TX1' } });
  assert.strictEqual(pathGet(payload, 'data.refid'), 'TX1');
});

test('a missing method is treated as body-less', () => {
  const payload = webhookPayload({ query: { refid: 'TX1' } });
  assert.strictEqual(pathGet(payload, 'data.refid'), 'TX1');
});

test('a missing query is survivable', () => {
  assert.deepStrictEqual(webhookPayload({ method: 'GET' }), { data: {} });
  assert.deepStrictEqual(webhookPayload({}), { data: {} });
});

console.log('\nThe URL we hand out');

test('it carries no query string', () => {
  // This is the whole reason for the path form: iimmpact's dashboard answers
  // "Request failed with status code 400" and will not save a URL with one.
  const url = webhookEndpointUrl('abc123');
  assert.strictEqual(url.includes('?'), false, url);
  assert.strictEqual(url.includes('&'), false, url);
  assert.strictEqual(url.includes('='), false, url);
});

test('it points at the apiWebhook function and ends with the provider id', () => {
  assert.strictEqual(
    webhookEndpointUrl('abc123'),
    'https://us-central1-satulink-solutions.cloudfunctions.net/apiWebhook/abc123'
  );
  assert.strictEqual(FUNCTION_NAME, 'apiWebhook');
});

test('the URL we hand out is read back as the same provider id', () => {
  // The two halves used to live in different files and drifted apart.
  for (const id of ['abc123', 'A_b-9', 'x'.repeat(20)]) {
    const path = new URL(webhookEndpointUrl(id)).pathname;
    assert.strictEqual(webhookProviderId({ path, query: {} }), id, id);
  }
});

test('the provider id is URL-encoded', () => {
  assert.strictEqual(webhookEndpointUrl('a/b').endsWith('/apiWebhook/a%2Fb'), true, webhookEndpointUrl('a/b'));
});

console.log('\nThe handler uses it');

const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the method guard admits GET', () => {
  const source = read('functions/apiWebhookService.js');
  assert.ok(
    /req\.method !== 'POST' && req\.method !== 'GET'/.test(source),
    'GET must reach the handler, or every iimmpact callback is answered 405'
  );
  assert.ok(
    !/if \(req\.method !== 'POST'\) return/.test(source),
    'the POST-only guard must be gone'
  );
});

test('the handler takes its provider id and payload from this module', () => {
  const source = read('functions/apiWebhookService.js');
  assert.ok(/const providerId = webhookProviderId\(req\);/.test(source));
  assert.ok(/const body = webhookPayload\(req\);/.test(source));
  assert.ok(!/clean\(req\.query\?\.providerId/.test(source), 'the query-only read must be gone');
  assert.ok(
    !/req\.body && typeof req\.body === 'object'/.test(source),
    'the body-only read must be gone, or a GET callback settles nothing'
  );
});

test('neither service hands out a query-string callback URL any more', () => {
  // The URL iimmpact refuses to save must not survive anywhere that the
  // webhook screen or the Success TopUp provisioning can show it.
  for (const f of ['functions/apiWebhookService.js', 'functions/apiProviderService.js']) {
    assert.ok(!read(f).includes('apiWebhook?providerId='), f);
  }
});

console.log('\n' + passed + ' assertions passed');
