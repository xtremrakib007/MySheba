'use strict';
// IIMMPACT through a fixed-IP CONNECT proxy: configuration, which hosts use
// it, and that the tunnel request carries the target and the credentials.
const assert = require('assert');
const http = require('http');
const proxy = require('../functions/iimmpactProxy');

(async () => {
  assert.strictEqual(proxy.proxyConfig({}), null, 'unset: off');
  assert.strictEqual(proxy.proxyConfig({ IIMMPACT_PROXY_URL: 'not a url' }), null);
  assert.strictEqual(proxy.proxyConfig({ IIMMPACT_PROXY_URL: 'https://1.2.3.4:8888' }), null, 'only an http:// proxy (the tunnel itself is TLS)');
  assert.strictEqual(proxy.proxyConfig({ IIMMPACT_PROXY_URL: 'http://1.2.3.4' }), null, 'a port is required');
  const cfg = proxy.proxyConfig({ IIMMPACT_PROXY_URL: 'http://mysheba:p%40ss@1.2.3.4:8888' });
  assert.deepStrictEqual(cfg, { host: '1.2.3.4', port: 8888, auth: 'Basic ' + Buffer.from('mysheba:p@ss').toString('base64') });

  const env = { IIMMPACT_PROXY_URL: 'http://u:p@1.2.3.4:8888' };
  assert.strictEqual(proxy.usesProxy('api.iimmpact.com', env), true);
  assert.strictEqual(proxy.usesProxy('staging.iimmpact.com', env), true);
  assert.strictEqual(proxy.usesProxy('api.successtopup.com', env), false, 'other providers never use it');
  assert.strictEqual(proxy.usesProxy('iimmpact.com.evil.example', env), false);
  assert.strictEqual(proxy.usesProxy('api.iimmpact.com', {}), false);

  // A local proxy that refuses: the tunnel request names the target and
  // carries the credentials, and the refusal surfaces as an error.
  let seen = null;
  const server = http.createServer();
  server.on('connect', (req, socket) => { seen = { url: req.url, auth: req.headers['proxy-authorization'] }; socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const local = { IIMMPACT_PROXY_URL: `http://mysheba:secret@127.0.0.1:${server.address().port}` };
  const error = await new Promise((resolve) => proxy.tunnelConnection('api.iimmpact.com', 443, local)({}, (err) => resolve(err)));
  server.close();
  assert.ok(/refused the tunnel \(HTTP 407\)/.test(String(error && error.message)), String(error && error.message));
  assert.deepStrictEqual(seen, { url: 'api.iimmpact.com:443', auth: 'Basic ' + Buffer.from('mysheba:secret').toString('base64') });

  // The kept-alive agent (read-only calls) is one per proxy URL, and is
  // rebuilt when the URL changes.
  const a1 = proxy.keepAliveAgent(local);
  assert.strictEqual(proxy.keepAliveAgent(local), a1, 'reused while the proxy is unchanged');
  assert.strictEqual(a1.keepAlive, true);
  const a2 = proxy.keepAliveAgent({ IIMMPACT_PROXY_URL: 'http://u:p@127.0.0.1:1' });
  assert.notStrictEqual(a2, a1, 'a new proxy URL gets a new agent');
  a2.destroy();
  console.log('iimmpactProxy tests: PASS');
})().catch((e) => { console.error(e); process.exit(1); });
