#!/usr/bin/env node
'use strict';
/**
 * Purchase screens let the customer go after a few seconds and show the order
 * reference before the server answers (src/firebase/orderSubmit.js). That
 * reference must be the id the server writes - sha256(uid|service|requestId)
 * cut to 40 hex characters - or History and the result page point at nothing.
 */
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const esbuild = require('esbuild');
const ROOT = path.join(__dirname, '..');

const stubs = {
  'expo-crypto': `module.exports = { CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: async (_a, s) => require('crypto').createHash('sha256').update(s).digest('hex').toUpperCase() };`,
  './config': `module.exports = { auth: { currentUser: { uid: 'user123' } } };`,
};

(async () => {
  const out = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/firebase/orderSubmit.js')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^(expo-crypto|\.\/config)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
    } }],
  });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, require);
  const { settleWithin, serviceKey, expectedTransactionId } = m.exports;

  // The labels functions/chargeGuards.js maps callables to.
  assert.strictEqual(serviceKey('Bill Payment'), 'billpayment');
  assert.strictEqual(serviceKey('IIMMPACT'), 'iimmpact');
  assert.strictEqual(serviceKey('eSIM'), 'esim');
  assert.strictEqual(serviceKey('Offer Packs'), 'offerpacks');

  const server = (service, requestId) => crypto.createHash('sha256').update(`user123|${service}|${requestId}`).digest('hex').slice(0, 40);
  assert.strictEqual(await expectedTransactionId('recharge', 'abc123abc123abc123'), server('recharge', 'abc123abc123abc123'));
  assert.strictEqual(await expectedTransactionId('recharge-pin', 'r'.repeat(32)), server('recharge-pin', 'r'.repeat(32)));

  assert.deepStrictEqual(await settleWithin(Promise.resolve('tx1'), 50), { settled: true, value: 'tx1' });
  assert.deepStrictEqual(await settleWithin(new Promise((r) => setTimeout(() => r('late'), 200)), 20), { settled: false });
  await assert.rejects(settleWithin(Promise.reject(new Error('balance')), 50), /balance/);
  console.log('order submit: ok');
})().catch((e) => { console.error(e); process.exit(1); });
