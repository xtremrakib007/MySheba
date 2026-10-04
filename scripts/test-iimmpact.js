'use strict';

// iimmpact: request signing, response classification and callback source
// checking.
//
// Everything here guards a failure that is silent in production:
//
//   * a wrong canonical string fails identically to a wrong key - 401 on every
//     call, with nothing to say which half disagreed;
//   * a response read as a refusal when it was only pending refunds a
//     transaction the provider went on to complete, so the money leaves twice;
//   * a callback source read from the attacker-controlled end of
//     X-Forwarded-For lets anyone settle any transaction.

const assert = require('assert');
const crypto = require('crypto');

const signing = require('../functions/iimmpactSigning');
const { matchesStatus } = require('../functions/statusMatch');
const source = require('../functions/webhookSource');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

// A 32-byte secret expressed the way the dashboard shows one: base64.
const SECRET = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
const BODY = JSON.stringify({ refid: 'MS-42', product: 'JOMPAY', account: '1234567890', amount: '150.00' });

console.log('\nRequest signing');

test('the canonical string is exactly the one iimmpact recomputes', () => {
  // Rebuilt here from their Postman pre-request script, independently of the
  // implementation, so a drift in either shows up as a mismatch.
  const timestamp = '1764547200';
  const nonce = 'req-1764547200-11111111-2222-3333-4444-555555555555';
  const bodyHash = crypto.createHash('sha256').update(BODY).digest('base64');
  const expected = `v1:${timestamp}:${nonce}:POST::${bodyHash}`;
  assert.strictEqual(signing.buildCanonical({ timestamp, nonce, method: 'POST', body: BODY }), expected);
});

test('the signature is HMAC-SHA256 over that string with the DECODED secret', () => {
  const nonce = 'req-1764547200-abc';
  const headers = signing.signIimmpactRequest({ apiKey: 'pk_live', secretKey: SECRET, method: 'POST', body: BODY, nowMs: 1764547200000, nonce });
  const canonical = signing.buildCanonical({ timestamp: '1764547200', nonce, method: 'POST', body: BODY });
  const expected = crypto.createHmac('sha256', Buffer.from(SECRET, 'base64')).update(canonical).digest('base64');
  assert.strictEqual(headers['x-signature'], 'v1=' + expected);
  // And NOT the secret's own characters, which is the easy mistake and gives a
  // completely different, always-rejected signature.
  const wrong = crypto.createHmac('sha256', SECRET).update(canonical).digest('base64');
  assert.notStrictEqual(headers['x-signature'], 'v1=' + wrong);
});

test('the path is not part of the signature', () => {
  // Adding it looks more correct and breaks every request. The signer is given
  // the whole URL, so two requests differing only in path must sign the same.
  const a = signing.buildCanonical({ timestamp: '1', nonce: 'n', method: 'GET', url: new URL('https://api.iimmpact.com/v2/balance') });
  const b = signing.buildCanonical({ timestamp: '1', nonce: 'n', method: 'GET', url: new URL('https://api.iimmpact.com/v2/topup') });
  assert.strictEqual(a, b);
  // The host is not signed either.
  const c = signing.buildCanonical({ timestamp: '1', nonce: 'n', method: 'GET', url: new URL('https://staging.iimmpact.com/v2/balance') });
  assert.strictEqual(a, c);
});

test('the timestamp is Unix seconds, not milliseconds', () => {
  const headers = signing.signIimmpactRequest({ apiKey: 'k', secretKey: SECRET, method: 'GET', nowMs: 1764547200123 });
  assert.strictEqual(headers['x-timestamp'], '1764547200');
  assert.strictEqual(headers['x-timestamp'].length, 10, 'a 13-digit value is milliseconds and falls outside their five-minute window');
});

test('a request with no body still signs the hash of the empty string', () => {
  // Their five GET endpoints all sign an empty body. An empty FIELD instead of
  // an empty hash fails all of them while POSTs keep working.
  const emptyHash = crypto.createHash('sha256').update('').digest('base64');
  assert.strictEqual(signing.hashBody(undefined), emptyHash);
  assert.strictEqual(signing.hashBody(''), emptyHash);
  assert.ok(signing.buildCanonical({ timestamp: '1', nonce: 'n', method: 'GET' }).endsWith(':' + emptyHash));
});

test('query parameters are sorted by key, with decoded values', () => {
  const url = new URL('https://x/v2/balance-statement?limit=20&date=2026-04-30&account=9');
  assert.strictEqual(signing.canonicalQuery(url.searchParams), 'account=9&date=2026-04-30&limit=20');
  // Order in the URL must not change the signature.
  const other = new URL('https://x/v2/balance-statement?date=2026-04-30&account=9&limit=20');
  assert.strictEqual(
    signing.buildCanonical({ timestamp: '1', nonce: 'n', method: 'GET', url }),
    signing.buildCanonical({ timestamp: '1', nonce: 'n', method: 'GET', url: other }),
  );
  // No query at all is an empty field, not an omitted one.
  assert.strictEqual(signing.canonicalQuery(new URL('https://x/v2/balance').searchParams), '');
  assert.ok(signing.buildCanonical({ timestamp: '1', nonce: 'n', method: 'GET', url: new URL('https://x/v2/balance') }).includes(':GET::'));
});

test('the nonce is fresh on every call, including identical requests', () => {
  const a = signing.signIimmpactRequest({ apiKey: 'k', secretKey: SECRET, method: 'GET', nowMs: 1764547200000 });
  const b = signing.signIimmpactRequest({ apiKey: 'k', secretKey: SECRET, method: 'GET', nowMs: 1764547200000 });
  assert.notStrictEqual(a['x-nonce'], b['x-nonce'], 'a reused nonce is what their replay window rejects');
  assert.notStrictEqual(a['x-signature'], b['x-signature']);
});

test('a secret that is not base64 is refused rather than silently mangled', () => {
  // Buffer.from(x, 'base64') never throws: it drops what it does not recognise
  // and hands back the wrong key, so every call 401s with no explanation.
  for (const bad of ['not base64!!', 'deadbeef0', '', '   ']) {
    assert.throws(() => signing.decodeSecret(bad), /base64|not configured|no bytes/i, `accepted ${JSON.stringify(bad)}`);
  }
  assert.doesNotThrow(() => signing.decodeSecret(SECRET));
});

test('signing refuses to run without both halves of the credential', () => {
  assert.throws(() => signing.signIimmpactRequest({ secretKey: SECRET, method: 'GET' }), /API key/i);
  assert.throws(() => signing.signIimmpactRequest({ apiKey: 'k', method: 'GET' }), /secret/i);
});

test('the method is uppercased before signing', () => {
  const a = signing.buildCanonical({ timestamp: '1', nonce: 'n', method: 'post', body: BODY });
  const b = signing.buildCanonical({ timestamp: '1', nonce: 'n', method: 'POST', body: BODY });
  assert.strictEqual(a, b);
});

test('a changed body changes the signature', () => {
  const nonce = 'req-1-x';
  const one = signing.signIimmpactRequest({ apiKey: 'k', secretKey: SECRET, method: 'POST', body: BODY, nowMs: 1e12, nonce });
  const two = signing.signIimmpactRequest({ apiKey: 'k', secretKey: SECRET, method: 'POST', body: BODY.replace('150.00', '1500.00'), nowMs: 1e12, nonce });
  assert.notStrictEqual(one['x-signature'], two['x-signature']);
});

console.log('\nStatus matching');

test('a single configured value still matches only itself', () => {
  assert.ok(matchesStatus('Succesful', 'Succesful'));
  assert.ok(!matchesStatus('Failed', 'Succesful'));
});

test("iimmpact's two spellings of success both match", () => {
  // /v2/topup says Succesful, /v2/transactions says Successful.
  assert.ok(matchesStatus('Succesful', 'Succesful, Successful'));
  assert.ok(matchesStatus('Successful', 'Succesful, Successful'));
  assert.ok(!matchesStatus('Failed', 'Succesful, Successful'));
  assert.ok(!matchesStatus('Processing', 'Succesful, Successful'));
});

test('a boolean result still compares as itself', () => {
  // Success TopUp reports result: true against a configured "true".
  assert.ok(matchesStatus(true, 'true'));
  assert.ok(!matchesStatus(false, 'true'));
});

test('an absent value matches nothing, and an empty setting matches nothing', () => {
  assert.ok(!matchesStatus(undefined, 'Succesful'));
  assert.ok(!matchesStatus(null, 'Succesful'));
  assert.ok(!matchesStatus('anything', null));
  assert.ok(!matchesStatus('anything', ''));
  assert.ok(!matchesStatus('anything', ' , , '));
  // The case the null guard actually exists for: a status field left reading
  // "undefined" or "null" - a plausible typo, or a value copied out of a log -
  // would otherwise match every response that omits the field, so a provider
  // answering nothing at all would read as a success.
  assert.ok(!matchesStatus(undefined, 'undefined'));
  assert.ok(!matchesStatus(null, 'null'));
  assert.ok(!matchesStatus(undefined, 'Succesful, undefined'));
});

console.log('\nResponse classification (what decides a refund)');

const classify = require('../functions/apiProviderService')._test.classifyResponse;

const IIMMPACT = {
  responseSuccessPath: 'data.status',
  responseSuccessValue: 'Succesful, Successful',
  responseProcessingPath: 'data.status',
  responseProcessingValue: 'Accepted, Processing',
};
const reply = (status) => ({ data: { status } });

test('Succesful completes', () => {
  assert.strictEqual(classify(IIMMPACT, reply('Succesful')), 'completed');
});

test('Accepted and Processing are pending, NOT a refusal', () => {
  // This is the double-spend. Both arrive with HTTP 200 and a created
  // transaction; classifying either as rejected refunds a live top-up.
  assert.strictEqual(classify(IIMMPACT, reply('Accepted')), 'processing');
  assert.strictEqual(classify(IIMMPACT, reply('Processing')), 'processing');
});

test('Failed is still a refusal', () => {
  // Pending-first must not swallow a genuine no.
  assert.strictEqual(classify(IIMMPACT, reply('Failed')), 'rejected');
  assert.strictEqual(classify(IIMMPACT, reply('Rubbish')), 'rejected');
});

test('a provider reporting a boolean success is unchanged', () => {
  const successTopUp = { responseSuccessPath: 'result', responseSuccessValue: 'true' };
  assert.strictEqual(classify(successTopUp, { result: true }), 'completed');
  assert.strictEqual(classify(successTopUp, { result: false }), 'rejected');
});

test('no configured success path means HTTP 200 was the answer', () => {
  assert.strictEqual(classify({}, { anything: 1 }), 'completed');
});

test('an explicit false is a refusal even with no configured value', () => {
  assert.strictEqual(classify({ responseSuccessPath: 'ok' }, { ok: false }), 'rejected');
});

test('a processing path that is not configured cannot make everything pending', () => {
  const noPending = { responseSuccessPath: 'data.status', responseSuccessValue: 'Succesful' };
  assert.strictEqual(classify(noPending, reply('Accepted')), 'rejected');
  assert.strictEqual(classify(noPending, reply('Succesful')), 'completed');
});

console.log('\nCallback source (what decides whether a callback is believed)');

const req = (xff, remote) => ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: remote } });

test('a caller cannot put itself on the allowlist with its own header', () => {
  // Google's front end APPENDS, so this reads
  //   <spoofed>, <the real caller>, <the front end>
  // and the first entry is the one entry the caller writes.
  const spoofed = req('18.140.170.98, 203.0.113.9, 130.211.0.1');
  assert.strictEqual(source.callbackSourceIp(spoofed), '203.0.113.9');
  assert.strictEqual(source.isAllowedSource(spoofed, ['18.140.170.98']), false);
});

test('the provider itself is allowed', () => {
  const genuine = req('18.140.170.98, 130.211.0.1');
  assert.strictEqual(source.callbackSourceIp(genuine), '18.140.170.98');
  assert.strictEqual(source.isAllowedSource(genuine, ['18.140.170.98']), true);
});

test('an empty allowlist allows nobody', () => {
  const genuine = req('18.140.170.98, 130.211.0.1');
  assert.strictEqual(source.isAllowedSource(genuine, []), false);
  assert.strictEqual(source.isAllowedSource(genuine, undefined), false);
});

test('an IPv4-mapped address matches its plain form', () => {
  assert.strictEqual(source.normaliseIp('::ffff:18.140.170.98'), '18.140.170.98');
  assert.strictEqual(source.isAllowedSource(req('::ffff:18.140.170.98, 130.211.0.1'), ['18.140.170.98']), true);
  assert.strictEqual(source.isAllowedSource(req('18.140.170.98, 130.211.0.1'), ['::ffff:18.140.170.98']), true);
});

test('an IPv6 address is not truncated at its first colon', () => {
  assert.strictEqual(source.normaliseIp('2600:1f18::a'), '2600:1f18::a');
  assert.strictEqual(source.normaliseIp('[2600:1f18::a]'), '2600:1f18::a');
});

test('a port is stripped from an IPv4 address', () => {
  assert.strictEqual(source.normaliseIp('18.140.170.98:443'), '18.140.170.98');
});

test('with no header at all the socket address is used', () => {
  assert.strictEqual(source.callbackSourceIp(req(undefined, '18.140.170.98')), '18.140.170.98');
  assert.strictEqual(source.callbackSourceIp(req(undefined, undefined)), '');
  assert.strictEqual(source.isAllowedSource(req(undefined, undefined), ['18.140.170.98']), false);
});

test('a typo in the allowlist is refused, not quietly dropped', () => {
  // A dropped entry leaves an allowlist that refuses the real sender, and the
  // operator sees a working save and a dead webhook.
  assert.throws(() => source.parseAllowedIps('18.140.170.98, 999.1.1.1'), /not a valid IP/);
  assert.throws(() => source.parseAllowedIps(['18.140.170.98', 'nonsense']), /not a valid IP/);
  assert.deepStrictEqual(source.parseAllowedIps('18.140.170.98, 13.251.0.7'), ['18.140.170.98', '13.251.0.7']);
  assert.deepStrictEqual(source.parseAllowedIps('18.140.170.98 18.140.170.98'), ['18.140.170.98'], 'duplicates collapse');
  assert.deepStrictEqual(source.parseAllowedIps(''), []);
  assert.deepStrictEqual(source.parseAllowedIps(undefined), []);
});

test('the allowlist is bounded', () => {
  const many = Array.from({ length: source.MAX_ALLOWED_IPS + 1 }, (_, i) => `10.0.0.${i + 1}`);
  assert.throws(() => source.parseAllowedIps(many), /At most/);
});

console.log('\nProvider configuration');

const providerService = require('../functions/apiProviderService');

test('iimmpactHmac is an accepted authentication type', () => {
  const validate = providerService._test.validate;
  const base = {
    name: 'iimmpact', country: 'ALL', service: 'Recharge',
    baseUrl: 'https://api.iimmpact.com', endpointPath: '/v2/topup', method: 'POST',
    authType: 'iimmpactHmac', apiKey: 'pk_live', secretKey: SECRET,
  };
  const saved = validate(base);
  assert.strictEqual(saved.authType, 'iimmpactHmac');
  // Both halves are required, and the secret's shape is checked while someone
  // is still looking at the form.
  assert.throws(() => validate({ ...base, secretKey: '' }), /API key and an HMAC secret/);
  assert.throws(() => validate({ ...base, apiKey: '' }), /API key and an HMAC secret/);
  assert.throws(() => validate({ ...base, secretKey: 'not base64!!' }), /base64/);
});

test('the signature is not emitted as a static header', () => {
  // providerAuth runs before the body exists, so it must contribute nothing
  // for this type - the headers are added next to the send instead.
  assert.deepStrictEqual(providerService._test.providerAuth({ authType: 'iimmpactHmac', apiKey: 'k', secretKey: SECRET }), {});
});

console.log(`\n${passed} checks passed.\n`);
