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
assert.throws(() => api.validateHeaders({ 'x-test': 'bad\\nvalue' }));

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

console.log('apiProviderService tests: PASS');
