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

console.log('\nWhat a 401 actually means');

test('"API key not found" is not a signing problem, and does not say it is', () => {
  // A blanket "check the HMAC secret" sent somebody to re-paste a secret that
  // was fine. The provider's own words distinguish the two causes.
  const hint = require('../functions/apiProviderService')._test_iimmpactAuthHint;
  const onProduction = hint('API key not found', 'https://api.iimmpact.com');
  assert.ok(/secret is probably fine/.test(onProduction), onProduction);
  assert.ok(/staging\.iimmpact\.com/.test(onProduction), 'and names the other environment to try');
  assert.ok(!/base64/.test(onProduction), 'without sending them to the secret');
});

test('it points at the OTHER environment, whichever one is configured', () => {
  // The keys page is on dashboard-staging and the preset points at
  // production, so this mismatch is the likeliest first-run failure.
  const hint = require('../functions/apiProviderService')._test_iimmpactAuthHint;
  assert.ok(/api\.iimmpact\.com/.test(hint('API key not found', 'https://staging.iimmpact.com')));
  assert.ok(/staging\.iimmpact\.com/.test(hint('API key not found', 'https://api.iimmpact.com')));
});

test('a real signature failure still sends them to the secret', () => {
  const hint = require('../functions/apiProviderService')._test_iimmpactAuthHint;
  for (const reason of ['Signature mismatch', 'Invalid signature', 'Unauthorized']) {
    const out = hint(reason, 'https://api.iimmpact.com');
    assert.ok(/base64 value from the dashboard/.test(out), reason);
    assert.ok(!/probably fine/.test(out), reason);
  }
});

test('the provider\u2019s own words are shown, not paraphrased away', () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  assert.ok(/iimmpact refused the credentials: "\$\{reason\}"/.test(source),
    '"rejected the signature" was our wording for a message that said something else entirely');
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

console.log('\nWhat a refusal that is not a 401 means');

test('a 403 is not sent to the secret, because the secret was never weighed', () => {
  // "iimmpact rejected the request: Forbidden" said nothing about what to do.
  // A 403 with {"message":"Forbidden"} is a gateway turning the call away
  // before the credentials are read, so advice about the HMAC secret is wrong.
  const hint = require('../functions/apiProviderService')._test_iimmpactRejectionHint;
  const out = hint(403, 'https://api.iimmpact.com');
  assert.ok(!/base64/.test(out), 'must not send them to the secret: ' + out);
  assert.ok(/not the secret/.test(out), out);
});

test('a 403 names the environment mismatch first', () => {
  // It is still the likeliest cause: the keys page is on dashboard-staging
  // and the provider preset points at production.
  const hint = require('../functions/apiProviderService')._test_iimmpactRejectionHint;
  assert.ok(/staging\.iimmpact\.com/.test(hint(403, 'https://api.iimmpact.com')));
  assert.ok(/api\.iimmpact\.com/.test(hint(403, 'https://staging.iimmpact.com')));
});

test('a 403 warns that an IP allowlist cannot work from Cloud Functions', () => {
  // Worth saying before they ask iimmpact to allowlist an address that
  // changes under them. The wording is free to change; naming Cloud Functions
  // and the absence of a fixed address is not.
  const hint = require('../functions/apiProviderService')._test_iimmpactRejectionHint;
  const out = hint(403, 'https://api.iimmpact.com');
  assert.ok(/Cloud Functions/.test(out), out);
  assert.ok(/no fixed address|wide Google range|static egress/.test(out), out);
});

test('each status gets its own cause, and none invents one', () => {
  const hint = require('../functions/apiProviderService')._test_iimmpactRejectionHint;
  assert.ok(/path, not the credentials/.test(hint(404, 'https://api.iimmpact.com')));
  assert.ok(/rate limiting/.test(hint(429, 'https://api.iimmpact.com')));
  assert.ok(/fault on their side/.test(hint(503, 'https://api.iimmpact.com')));
  // A status we have no account of must not borrow another one's explanation.
  const unknown = hint(418, 'https://api.iimmpact.com');
  assert.ok(/whole of what they said/.test(unknown), unknown);
  assert.ok(!/gateway|path|rate limiting|fault on their side/.test(unknown), unknown);
});

test('the status reaches the message, so our 503 is not read as theirs', () => {
  // The screen showed "[503]" - our callable's unavailable code - next to a
  // message that never said what iimmpact actually answered.
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  assert.ok(/iimmpact rejected the request \(HTTP \$\{response\.status\}\)/.test(source), source.includes('iimmpact rejected the request') ? 'the status is still missing' : 'the message is gone');
  assert.ok(/iimmpactRejectionHint\(response\.status, provider\.baseUrl\)/.test(source), 'and the hint must be used');
});

test('every message fits the cap the callable truncates at', () => {
  // The 403 hint was 631 characters and the callable slices at 500, so the
  // dialog ended "...restricts caller IP address [503]" - the warning that an
  // IP allowlist cannot work from Cloud Functions was the part cut off, which
  // is exactly the part that would have sent someone to iimmpact asking for
  // the wrong thing.
  const providerService = require('../functions/apiProviderService');
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  // Read the limit from the code rather than restating it, so changing one
  // does not leave the other quietly wrong.
  const cap = Number(/Unable to connect to \$\{label\}\.`\)\.slice\(0, (\d+)\)/.exec(source)?.[1]);
  assert.ok(Number.isInteger(cap) && cap > 0, 'the truncation point must still be findable in the source');

  // Not "Forbidden": a reason at its shortest measures the budget at its best
  // case, and the next provider message will not be nine characters.
  const reason = 'Forbidden: request not permitted for this key';
  for (const status of [403, 404, 429, 500, 503, 418]) {
    const message = `iimmpact rejected the request (HTTP ${status}): "${reason}". `
      + providerService._test_iimmpactRejectionHint(status, 'https://api.iimmpact.com');
    assert.ok(message.length <= cap, `HTTP ${status} message is ${message.length} > ${cap}: ` + message);
  }
  for (const r of ['API key not found', 'Signature mismatch']) {
    const message = `iimmpact refused the credentials: "${r}". `
      + providerService._test_iimmpactAuthHint(r, 'https://api.iimmpact.com');
    assert.ok(message.length <= cap, `401 "${r}" message is ${message.length} > ${cap}`);
  }
});

console.log('\nA refused order says why');

const providerSource = () => require('fs').readFileSync(
  require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');

test('the provider\u2019s own reason reaches the message', () => {
  // A real PUBG order came back as "Provider HTTP 400 [400]" - a number,
  // twice, and nothing to act on - while the parsed body sat right there in
  // `data` saying what was actually wrong.
  const { getPath } = require('../functions/apiProviderService')._test;
  assert.strictEqual(getPath({ error: { message: 'Invalid product' } }, 'error.message'), 'Invalid product');
  assert.strictEqual(getPath({ message: 'Insufficient balance' }, 'message'), 'Insufficient balance');
  const source = providerSource();
  assert.ok(/getPath\(data,'error\.message'\)\|\|getPath\(data,'message'\)/.test(source),
    'both shapes iimmpact uses must be read');
  assert.ok(/Provider HTTP \$\{response\.status\}: \$\{reason\}/.test(source),
    'and the reason must reach the message');
});

test('a 4xx is still definitive, so a refused order is refunded not left unknown', () => {
  // This is the money. `definitive` decides between status 'failed' (refund is
  // safe, the provider replied and refused) and 'unknown' (the customer stays
  // charged pending reconciliation). It used to be decided by matching the
  // message against /^Provider HTTP 4\d{2}$/ - which a reason appended to it
  // no longer matches. If the flag had not been set in its place, every
  // refusal that now carries a reason would have been filed as uncertain.
  const source = providerSource();
  assert.ok(/failure\.providerRejected=true;/.test(source), 'the flag must be set');
  assert.ok(/const definitive=requestSent===false\|\|e\?\.providerRejected===true/.test(source),
    'and definitive must still read it');

  // The regex the flag replaced genuinely cannot see the new message.
  assert.ok(/^Provider HTTP 4\d{2}$/.test('Provider HTTP 400'));
  assert.ok(!/^Provider HTTP 4\d{2}$/.test('Provider HTTP 400: Invalid product'),
    'which is precisely why the flag carries it now');
  // The backstop still has to work for a refusal that carries no reason - and
  // it has to be IN the definitive test, not merely somewhere in the file.
  // Searching the whole source matched the comment above describing it, so
  // deleting the real one changed nothing.
  const definitiveExpr = /const definitive=[^;]+;/.exec(source);
  assert.ok(definitiveExpr, 'the definitive test must be findable');
  assert.ok(definitiveExpr[0].includes(String.raw`/^Provider HTTP 4\d{2}$/`),
    'the backstop must remain in the definitive test itself');
});

test('a 5xx is NOT marked refused', () => {
  // A 5xx may have processed the top-up before failing. Marking it definitive
  // would refund an order the customer actually received.
  const source = providerSource();
  const bounds = /if\(response\.status>=(\d+)&&response\.status<(\d+)\) failure\.providerRejected=true;/.exec(source);
  assert.ok(bounds, 'the refused range must be stated explicitly');
  const [lo, hi] = [Number(bounds[1]), Number(bounds[2])];
  for (const status of [400, 401, 403, 404, 422, 429, 499]) {
    assert.ok(status >= lo && status < hi, status + ' must count as refused');
  }
  for (const status of [500, 502, 503, 504, 200, 302]) {
    assert.ok(!(status >= lo && status < hi), status + ' must NOT count as refused');
  }
});

console.log('\nWe say who we are');

test('every provider call carries a User-Agent', () => {
  // Node sends none, and a missing User-Agent is a common reason for a WAF to
  // answer a bare "Forbidden". It is set in requestHttpsPinned so that the
  // credential test, the dispatch and every catalogue read all get it.
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions/apiProviderService.js'), 'utf8');
  assert.ok(/const USER_AGENT = '[^']+';/.test(source));
  assert.ok(/headers: \{ 'user-agent': USER_AGENT, \.\.\.options\.headers \}/.test(source),
    'ours must come first so an explicit header still wins');
  assert.ok(!/headers: options\.headers,/.test(source), 'the bare pass-through must be gone');
});

console.log(`\n${passed} checks passed.\n`);
