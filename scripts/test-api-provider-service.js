const assert = require('assert');

// Focused regression tests for pure API-provider validation helpers.
// No Firestore, credentials, or outbound network calls are used here.
const api = require('../functions/apiProviderService')._test;

assert(api, 'test helpers must be exported');

// URL validation: only HTTPS domains, no embedded credentials/fragments/raw IPs.
api.validateBaseUrl('https://api.example.com');
// SSRF reserved-address regression coverage.
assert.strictEqual(api.isPrivateIp('192.0.2.1'), true);
assert.strictEqual(api.isPrivateIp('198.51.100.10'), true);
assert.strictEqual(api.isPrivateIp('203.0.113.10'), true);
assert.strictEqual(api.isPrivateIp('224.0.0.1'), true);
assert.strictEqual(api.isPrivateIp('240.0.0.1'), true);
assert.strictEqual(api.isPrivateIp('::1'), true);
assert.strictEqual(api.isPrivateIp('2001:db8::1'), true);
assert.strictEqual(api.isPrivateIp('ff02::1'), true);
assert.strictEqual(api.isPrivateIp('2001:4860:4860::8888'), false);

assert.throws(() => api.validateBaseUrl('http://api.example.com'));
assert.throws(() => api.validateBaseUrl('https://127.0.0.1'));
assert.throws(() => api.validateBaseUrl('https://user:pass@api.example.com'));
assert.throws(() => api.validateBaseUrl('https://api.example.com/#secret'));
assert.throws(() => api.validateBaseUrl('https://api.example.com?apiKey=secret'));

// Header hardening.
api.validateHeaders({ accept: 'application/json', 'x-test': true });
assert.throws(() => api.validateHeaders({ Host: 'evil.example' }));
assert.throws(() => api.validateHeaders({ 'x-test': 'bad\nvalue' }), 'LF in a header value must be rejected');
assert.throws(() => api.validateHeaders({ 'x-test': 'bad\r\nX-Injected: evil' }), 'CRLF header injection must be rejected');
assert.throws(() => api.validateHeaders({ 'x-test': 'bad\u0000value' }), 'NUL in a header value must be rejected');
// And the guard must not over-reject: it is control characters only, not
// digits, capitals or ':' - which is what the mangled class actually matched.
api.validateHeaders({ 'content-type': 'application/json', 'x-api-version': '2', authorization: 'Bearer abc123' });

// Template bounds and object-only parsing.
assert.deepStrictEqual(api.validateTemplate('{"amount":"{{amount}}"}', 'Request'), { amount: '{{amount}}' });
assert.deepStrictEqual(api.validateTemplate('not-json', 'Request'), {});

// Rendering is deterministic and does not evaluate arbitrary expressions.
assert.strictEqual(api.render('order-{{requestId}}-{{missing}}', { requestId: 'abc' }), 'order-abc-');
assert.deepStrictEqual(api.render({ amount: '{{amount}}' }, { amount: 10 }), { amount: '10' });

// Nested response extraction.
assert.strictEqual(api.getPath({ data: { pin: '1234' } }, 'data.pin'), '1234');
assert.strictEqual(api.getPath({ data: {} }, 'data.pin'), undefined);

// Authentication must not silently produce empty credentials.
assert.deepStrictEqual(api.providerAuth({ authType: 'apiKey', apiKey: 'abc' }), { 'x-api-key': 'abc' });
assert.deepStrictEqual(api.providerAuth({ authType: 'bearer', apiKey: 'abc' }), { authorization: 'Bearer abc' });
assert.deepStrictEqual(api.providerAuth({ authType: 'none' }), {});

// Recharge PIN configuration and auth requirements.
api.validate({ service: 'Recharge PIN', name: 'Test', baseUrl: 'https://api.example.com', responsePinPath: 'data.pin', authType: 'none' });
assert.throws(() => api.validate({ service: 'Recharge PIN', name: 'Test', baseUrl: 'https://api.example.com', authType: 'none' }));
assert.throws(() => api.validate({ service: 'Recharge', name: 'Test', baseUrl: 'https://api.example.com', authType: 'apiKey', apiKey: '' }));
assert.throws(() => api.validate({ service: 'Recharge', name: 'Test', baseUrl: 'https://api.example.com', authType: 'basic', username: 'u', password: '' }));

// ---- the superadmin can configure every service the backend routes ----
// 'Offer Packs' was allowed and charged server-side but missing from the
// client list, so no superadmin could create a provider for it; the only one
// that existed was the companion Success TopUp provisions for itself. That is
// exactly the "why is this Success TopUp only" shape, and it turned out to be
// a one-line omission rather than a design decision.
{
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  const serverSrc = fs.readFileSync(path.join(root, 'functions', 'apiProviderService.js'), 'utf8');
  const clientSrc = fs.readFileSync(path.join(root, 'src', 'firebase', 'apiProviderService.js'), 'utf8');

  const serverMatch = serverSrc.match(/const ALLOWED_SERVICES\s*=\s*(\[[^\]]*\])/);
  const clientMatch = clientSrc.match(/export const API_SERVICES\s*=\s*(\[[^\]]*\])/);
  assert.ok(serverMatch && clientMatch, 'could not read both service lists');

  const parseList = (literal) => [...literal.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const server = parseList(serverMatch[1]);
  const client = parseList(clientMatch[1]);

  const missing = server.filter((x) => !client.includes(x));
  const extra = client.filter((x) => !server.includes(x));

  assert.ok(
    missing.length === 0,
    `Services the backend routes but the superadmin UI cannot configure: ${missing.join(', ')}`
  );
  assert.ok(
    extra.length === 0,
    `Services the superadmin UI offers but the backend rejects: ${extra.join(', ')}`
  );
  console.log(`  superadmin can configure all ${server.length} routed services`);
}

// ---- the pinned DNS lookup answers in the shape Node asked for ----
// A custom lookup has two callback contracts, chosen by options.all:
//   all falsy -> callback(err, address, family)
//   all true  -> callback(err, [{ address, family }])
// Node has defaulted autoSelectFamily to true since v20, so it asks with
// all:true. Answering positionally made it read addresses[0].address as
// undefined and throw "Invalid IP address: undefined" before a byte left the
// server - breaking every provider request: the recharge and bill-payment
// calls, the catalogue fetch and the Test API button. Reproduced on node
// v22.22.2 against a real host before this was fixed.
{
  const pinned = { address: '203.0.113.10', family: 4 };
  const lookup = api.pinnedLookup(pinned);

  let got;
  lookup('api.example.com', { all: true }, (err, value) => { got = { err, value }; });
  assert.strictEqual(got.err, null, 'all:true must not error');
  assert.ok(Array.isArray(got.value), 'all:true must answer with an array, or Node reads undefined');
  assert.strictEqual(got.value.length, 1);
  assert.strictEqual(got.value[0].address, '203.0.113.10');
  assert.strictEqual(got.value[0].family, 4);

  let positional;
  lookup('api.example.com', {}, (err, address, family) => { positional = { err, address, family }; });
  assert.strictEqual(positional.address, '203.0.113.10', 'all:false keeps the positional form');
  assert.strictEqual(positional.family, 4);

  // Node has passed undefined options in the past; it must not crash.
  let noOpts;
  lookup('api.example.com', undefined, (err, address, family) => { noOpts = { address, family }; });
  assert.strictEqual(noOpts.address, '203.0.113.10');
  assert.strictEqual(noOpts.family, 4);

  console.log('  pinned DNS lookup answers both callback shapes');
}

// The catalogue fields are optional, and "optional" has to include the shape
// the client actually sends back.
//
// listApiProviders projects an unset catalogue item map as null, and the
// Success TopUp setup form spreads the provider straight into its form state -
// so every save of that provider sent catalogItemMap: null. The guard here
// tested only for undefined, so null was taken as a real map and rejected with
// "Catalogue item map must map \"id\"". A provider taking its catalogue from a
// preset has no map of its own, which made it every save of that form.
{
  const base = { service: 'Recharge', name: 'Test', baseUrl: 'https://api.example.com', authType: 'none' };

  for (const [label, value] of [['null', null], ['empty string', ''], ['empty object', {}]]) {
    const out = api.validate({ ...base, catalogItemMap: value });
    assert.strictEqual(out.catalogItemMap, undefined, `catalogItemMap ${label} must mean "not set"`);
  }
  // Absent entirely is the same answer.
  assert.strictEqual(api.validate(base).catalogItemMap, undefined);

  // A real map is still validated, and still has to carry the two fields a
  // package cannot be identified or billed without.
  const good = api.validate({ ...base, catalogItemMap: { id: 'id', price: ['price', 'amount'] } });
  assert.deepStrictEqual(good.catalogItemMap, { id: 'id', price: ['price', 'amount'] });
  assert.throws(() => api.validate({ ...base, catalogItemMap: { price: 'price' } }), /must map "id"/);
  assert.throws(() => api.validate({ ...base, catalogItemMap: { id: 'id' } }), /must map "price"/);
  assert.throws(() => api.validate({ ...base, catalogItemMap: { id: '', price: 'p' } }), /at least one response key/);

  // Same for the request template, which the generic form can send as ''.
  assert.strictEqual(api.validate({ ...base, catalogRequestTemplate: null }).catalogRequestTemplate, undefined);
  assert.strictEqual(api.validate({ ...base, catalogRequestTemplate: '' }).catalogRequestTemplate, undefined);

  console.log('  optional catalogue fields accept null, empty and absent alike');
}

console.log('apiProviderService tests: PASS');
