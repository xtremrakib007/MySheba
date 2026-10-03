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
// A whole-placeholder keeps the value's type - see the typed-rendering block
// at the end of this file for why. This used to assert the string '10'.
assert.deepStrictEqual(api.render({ amount: '{{amount}}' }, { amount: 10 }), { amount: 10 });

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

// One API, several features. Bangladesh recharge and Bangladesh internet are
// the same Success TopUp account; before this each needed its own row with the
// credentials typed again, and rotating a key meant finding every copy.
{
  const base = { service: 'Recharge', name: 'Test', baseUrl: 'https://api.example.com', authType: 'none' };

  // The primary is always in the list, so a document written now reads back
  // the same way whether or not extra features were picked.
  assert.deepStrictEqual(api.validate(base).services, ['Recharge']);
  assert.deepStrictEqual(
    api.validate({ ...base, services: ['Internet', 'Offer Packs'] }).services,
    ['Recharge', 'Internet', 'Offer Packs'],
  );
  // Listing the primary again must not duplicate it.
  assert.deepStrictEqual(
    api.validate({ ...base, services: ['Recharge', 'Internet'] }).services,
    ['Recharge', 'Internet'],
  );
  // `service` is unchanged, which is what keeps the old queries working.
  assert.strictEqual(api.validate({ ...base, services: ['Internet'] }).service, 'Recharge');

  assert.throws(() => api.validate({ ...base, services: ['Nonsense'] }), /Invalid service: Nonsense/);
  // Junk in the array must not slip through as an empty entry.
  assert.deepStrictEqual(api.validate({ ...base, services: ['', null, 'Internet'] }).services, ['Recharge', 'Internet']);

  console.log('  one provider can serve several features, primary first');
}

// Request bodies have to match the documented types, not just the field names.
//
// Success TopUp documents amount as `number` and its own example sends
// "amount": 50. Every rendered value was a string, because the replace that
// substitutes placeholders stringifies - so a documented number went out
// quoted on the charge path.
{
  const template = {
    number: '{{phone}}', type: 'prepaid', operator: '{{operator}}',
    amount: '{{amount}}', package_id: '{{packageId}}', trxid: '{{requestId}}',
    note: 'ref {{requestId}}', flag: '{{enabled}}',
  };
  const out = api.render(template, {
    phone: '01712345678', operator: 'GP', amount: 50,
    packageId: '', requestId: 'trx-1', enabled: true,
  });

  assert.strictEqual(out.amount, 50, 'a whole-placeholder number keeps its type');
  assert.strictEqual(typeof out.amount, 'number');
  assert.strictEqual(out.flag, true, 'and so does a boolean');
  // Anything with text around the placeholder is interpolation, not a value.
  assert.strictEqual(out.note, 'ref trx-1');
  assert.strictEqual(out.type, 'prepaid');
  assert.strictEqual(out.trxid, 'trx-1');
  // A missing value is still the empty string, not the word "undefined".
  assert.strictEqual(out.package_id, '');

  // A numeric-looking STRING was given as a string and stays one - inferring a
  // type the caller did not use would be the same mistake in reverse.
  assert.strictEqual(api.render({ a: '{{x}}' }, { x: '007' }).a, '007');

  console.log('  a whole-placeholder keeps its value type, so amount sends as a number');
}

{
  // Execution routing. The bug this pins: saving Success TopUp switched
  // Recharge to API service-wide, and Recharge - unlike Internet and Bill
  // Payment - had no country guard, so a Malaysian recharge was dispatched to
  // a Bangladesh-only provider and came back "outcome is uncertain [503]" on a
  // wallet that had already been charged.
  const resolve = api.resolveExecutionMode;
  const bdOnly = [{ country: 'BD', active: true }];
  const everywhere = [{ country: 'ALL', active: true }];
  const bdOn = { countryModes: { BD: { Recharge: 'api' } } };

  assert.strictEqual(resolve({ country: 'BD', service: 'Recharge', settings: bdOn, providers: bdOnly }), 'api',
    'Bangladesh keeps running on the API');
  assert.strictEqual(resolve({ country: 'MY', service: 'Recharge', settings: bdOn, providers: bdOnly }), 'legacy',
    'Malaysia must become a manual dealer order, not an API dispatch');

  // Intent cannot beat reality: API is impossible with nothing behind it.
  assert.strictEqual(resolve({ country: 'MY', service: 'Recharge', settings: { countryModes: { MY: { Recharge: 'api' } } }, providers: bdOnly }), 'legacy',
    'API for a country with no provider serving it must fall back to manual');
  assert.strictEqual(resolve({ country: 'MY', service: 'Recharge', settings: { modes: { Recharge: 'api' } }, providers: [] }), 'legacy',
    'no provider at all means manual');
  assert.strictEqual(resolve({ country: 'MY', service: 'Recharge', settings: { countryModes: { MY: { Recharge: 'api' } } }, providers: everywhere }), 'api',
    'a provider that serves everywhere does serve Malaysia');
  assert.strictEqual(resolve({ country: 'MY', service: 'Recharge', settings: { countryModes: { MY: { Recharge: 'api' } } }, providers: [{ country: 'ALL', active: false }] }), 'legacy',
    'an inactive provider does not count');

  // The per-country row overrides the service-wide default in both directions.
  assert.strictEqual(resolve({ country: 'MY', service: 'Recharge', settings: { modes: { Recharge: 'api' }, countryModes: { MY: { Recharge: 'legacy' } } }, providers: everywhere }), 'legacy',
    'an explicit country opt-out beats the service default');
  assert.strictEqual(resolve({ country: 'SG', service: 'Recharge', settings: { modes: { Recharge: 'api' } }, providers: everywhere }), 'api',
    'a country with no row of its own inherits the service default');
  assert.strictEqual(resolve({ country: '', service: 'Recharge', settings: {}, providers: everywhere }), 'legacy',
    'an unknown country is manual, never API');

  console.log('  execution routing is per country, and never API without a provider behind it');
}

{
  // Saving Success TopUp must not switch a service on for every country. The
  // service-wide default staying 'legacy' is the whole fix.
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'apiProviderService.js'), 'utf8');
  const save = src.slice(src.indexOf('const priorCountryModes'), src.indexOf('const priorCountryModes') + 900);
  assert(save, 'the Success TopUp settings write must be findable');
  assert(/BD: \{ \.\.\.\(priorCountryModes\.BD \|\| \{\}\), Recharge: 'api'/.test(save),
    'saving Success TopUp must enable the API for Bangladesh');
  assert(!/modes: \{ \.\.\.DEFAULT_MODES, \.\.\.\(oldSettings\.modes \|\| \{\}\), Recharge: 'api'/.test(src),
    'saving Success TopUp must no longer switch services to API service-wide');

  console.log('  configuring Success TopUp enables Bangladesh only');
}

{
  // Secret Manager failures must not reach the app as a bare INTERNAL [500].
  // "API test failed INTERNAL [500]" was a plain Error from read(), which
  // named neither the secret, the HTTP status, nor what to do about it.
  const { secretError } = require('../functions/providerSecretService')._test;
  // firebase-functions lives under functions/, not at the repo root, so it has
  // to be resolved the way the functions code itself resolves it.
  const { createRequire } = require('module');
  const fromFunctions = createRequire(require.resolve('../functions/package.json'));
  const { HttpsError } = fromFunctions('firebase-functions/v2/https');

  const denied = secretError(new Error('Secret Manager request failed (403): permission denied'), 'read it', 'the Secret Manager Secret Accessor role');
  assert(denied instanceof HttpsError, 'a Secret Manager failure must become an HttpsError');
  assert.strictEqual(denied.code, 'failed-precondition', 'and not INTERNAL');
  assert(/403/.test(denied.message), 'the status belongs in the message');
  assert(/Secret Accessor/.test(denied.message), 'a 403 must name the role that fixes it');

  const other = secretError(new Error('Secret Manager request failed (500): backend error'), 'read it', 'the Secret Manager Secret Accessor role');
  assert(/500/.test(other.message) && !/Secret Accessor/.test(other.message),
    'a non-permission failure must not blame permissions');

  // An HttpsError thrown deliberately below keeps its own message.
  const passed = new HttpsError('failed-precondition', 'Google Cloud credentials are unavailable.');
  assert.strictEqual(secretError(passed, 'read it', 'a role'), passed, 'an existing HttpsError passes through unchanged');

  // Writing needs more than Accessor: put() creates the secret and adds a
  // version. Naming Accessor on a failed save sends the reader to a role that
  // cannot fix it.
  const write = secretError(new Error('Secret Manager request failed (403): denied'), 'store this credential', 'the Secret Manager Admin role');
  assert(/Admin/.test(write.message) && !/Accessor/.test(write.message),
    'a write failure must name a role that permits creating secrets');

  // Testing the helper alone is not enough: removing the wrap at either call
  // site left the suite green, which is the trap this check closes. Both
  // entry points into Secret Manager must route their failures through it.
  const fs = require('fs');
  const path = require('path');
  const svc = fs.readFileSync(path.join(__dirname, '..', 'functions', 'providerSecretService.js'), 'utf8');
  for (const [fn, marker] of [['getCredentials', "read this provider's stored credentials"], ['put', 'store this credential']]) {
    const at = svc.indexOf(`async function ${fn}(`);
    assert(at !== -1, `${fn} must exist`);
    const body = svc.slice(at, svc.indexOf('\nasync function ', at + 1));
    assert(body.includes(`secretError(e, '${marker}'`) || body.includes(`secretError(e, "${marker}"`),
      `${fn} must route Secret Manager failures through secretError, or they reach the app as INTERNAL [500]`);
  }

  console.log('  a Secret Manager failure explains itself instead of reaching the app as INTERNAL');
}

console.log('apiProviderService tests: PASS');
