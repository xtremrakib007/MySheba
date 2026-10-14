'use strict';

// IIMMPACT through a fixed-IP proxy in an allowed region.
//
// IIMMPACT confirmed that it refuses /v2/topup from source IPs in the United
// States - Cloud Functions run in us-central1 - and that it whitelists a
// fixed outbound IP. So every request to an IIMMPACT host can be tunnelled
// through a small HTTP CONNECT proxy (e.g. tinyproxy on a Singapore or
// Malaysia VM with a static IP). The tunnel is end-to-end TLS: the proxy sees
// only the host name, never the API key, the signature or the body, and the
// certificate is still checked against IIMMPACT's own name.
//
// Off unless IIMMPACT_PROXY_URL is set in functions/.env, e.g.
//   IIMMPACT_PROXY_URL=http://mysheba:<password>@203.0.113.10:8888
// Only IIMMPACT hosts use it; every other provider is untouched.

const http = require('http');
const https = require('https');
const tls = require('tls');

const IIMMPACT_HOST = /(^|\.)iimmpact\.com$/i;

/** The configured proxy, or null. Read per call so tests can set it. */
function proxyConfig(env = process.env) {
  const raw = String(env.IIMMPACT_PROXY_URL || '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch (_) { return null; }
  if (url.protocol !== 'http:' || !url.hostname || !url.port) return null;
  const auth = url.username
    ? 'Basic ' + Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')
    : '';
  return { host: url.hostname, port: Number(url.port), auth };
}

/** Whether a request to this host goes through the proxy. */
function usesProxy(hostname, env = process.env) {
  return IIMMPACT_HOST.test(String(hostname || '')) && !!proxyConfig(env);
}

/**
 * An https.request `createConnection` that opens a CONNECT tunnel to
 * host:443 through the proxy and starts TLS inside it.
 */
function tunnelConnection(hostname, port = 443, env = process.env) {
  const proxy = proxyConfig(env);
  return (options, done) => {
    const connect = http.request({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${hostname}:${port}`,
      headers: { host: `${hostname}:${port}`, ...(proxy.auth ? { 'proxy-authorization': proxy.auth } : {}) },
      timeout: 15000,
    });
    connect.once('connect', (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        done(new Error(`IIMMPACT proxy refused the tunnel (HTTP ${response.statusCode}).`));
        return;
      }
      const secure = tls.connect({ socket, servername: hostname });
      secure.once('secureConnect', () => done(null, secure));
      secure.once('error', (error) => done(error));
    });
    connect.once('timeout', () => connect.destroy(new Error('IIMMPACT proxy did not answer.')));
    connect.once('error', (error) => done(new Error(`IIMMPACT proxy unreachable: ${error.message}`)));
    connect.end();
  };
}

// A warm instance keeps its tunnel open between read-only calls. Each new
// tunnel is a TCP connect to the proxy, the CONNECT, and a TLS handshake with
// IIMMPACT - several round trips between us-central1 and Singapore - and an
// order makes two GETs (catalogue, options) before its purchase. Only GETs
// use this: a POST /v2/topup always opens a fresh tunnel, so a socket that
// went stale while idle can never turn a purchase into an unknown outcome.
// Idle tunnels close after IDLE_MS, well under the proxy's and IIMMPACT's
// own idle limits.
const IDLE_MS = 20000;
let keepAlive = null;
let keepAliveFor = '';
function keepAliveAgent(env = process.env) {
  const proxyKey = String(env.IIMMPACT_PROXY_URL || '');
  if (keepAlive && keepAliveFor === proxyKey) return keepAlive;
  if (keepAlive) keepAlive.destroy();
  const agent = new https.Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 4, timeout: IDLE_MS, scheduling: 'lifo' });
  agent.createConnection = (options, done) => {
    const host = options.servername || options.host;
    tunnelConnection(host, Number(options.port) || 443, env)(options, done);
  };
  keepAlive = agent;
  keepAliveFor = proxyKey;
  return agent;
}

module.exports = { proxyConfig, usesProxy, tunnelConnection, keepAliveAgent, IIMMPACT_HOST, IDLE_MS };
