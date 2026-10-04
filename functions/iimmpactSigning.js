'use strict';

// Request signing for iimmpact (API Key + HMAC-SHA256).
//
// Every other provider we talk to authenticates with a static credential: a
// key in a header, a bearer token, a username and password. Those are a header
// the provider record can almost describe by itself. iimmpact is the first one
// that wants a SIGNATURE, computed per request over the request's own method,
// query and body, so it cannot be expressed as configuration at all - no
// header template can hash a body that has not been built yet.
//
// The canonical string and every encoding choice below come from iimmpact's own
// Postman collection (iimmpact-api-key-hmac.postman_collection.json), which is
// the authoritative description of what their server recomputes:
//
//   canonical = "v1:<timestamp>:<nonce>:<METHOD>:<sortedQuery>:<bodyHash>"
//
//   timestamp    Unix SECONDS (not milliseconds), as a decimal string.
//   nonce        fresh per request, "req-<timestamp>-<uuid lowercase>".
//   METHOD       uppercase HTTP method.
//   sortedQuery  "k=v" pairs joined by "&", sorted by KEY, using the decoded
//                values; an empty string when there is no query.
//   bodyHash     base64(SHA-256(body)), over the EXACT bytes sent. A request
//                with no body hashes the empty string - which is a real hash,
//                not an empty field.
//
//   signature    base64(HMAC-SHA256(canonical, base64Decode(secret)))
//
// Two of those are easy to get wrong in a way nothing tells you about, because
// a wrong canonical string fails identically to a wrong key - 401 on every
// call, with no indication of which part disagreed:
//
//   * the secret is BASE64 and must be decoded to bytes before use. Signing
//     with the secret's own characters is a different key entirely.
//   * the path is NOT part of the canonical string. Adding it seems more
//     correct and breaks every request.
//
// Note what is deliberately absent: a caller-supplied timestamp or nonce. Both
// are generated here, per call, because reusing either is what their replay
// window is there to catch.

const crypto = require('crypto');

const SIGNATURE_VERSION = 'v1';

// A secret that is not base64 decodes to the wrong bytes and signs every
// request with the wrong key. The failure is a 401 from the provider - the same
// answer a correct secret gives when the canonical string is wrong - so it is
// worth refusing here, where we can say which of the two it was, rather than
// letting a misconfigured credential look like a signing bug forever.
function decodeSecret(secretKey) {
  const secret = String(secretKey || '').trim();
  if (!secret) throw new Error('iimmpact HMAC secret is not configured.');
  if (secret.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(secret)) {
    throw new Error('iimmpact HMAC secret must be the base64 value shown in the dashboard.');
  }
  const bytes = Buffer.from(secret, 'base64');
  if (bytes.length === 0) throw new Error('iimmpact HMAC secret decoded to no bytes.');
  return bytes;
}

// Sorted by key, with the DECODED values - URLSearchParams hands us decoded
// values and Postman signs what was typed, so the two agree. Sorting by the
// joined "k=v" pair instead would reorder two params sharing a prefix.
function canonicalQuery(searchParams) {
  if (!searchParams) return '';
  const pairs = [];
  for (const [key, value] of searchParams) pairs.push([key, value]);
  pairs.sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return pairs.map(([key, value]) => `${key}=${value}`).join('&');
}

function hashBody(body) {
  // Buffer and string both hash their own bytes; anything absent is the empty
  // string, which still has a hash.
  const payload = body == null ? '' : body;
  return crypto.createHash('sha256').update(payload, typeof payload === 'string' ? 'utf8' : undefined).digest('base64');
}

// Takes the whole URL rather than just its query, so that the path is in
// reach and visibly unused: it is NOT part of what iimmpact signs, and adding
// it is the mistake that reads as more correct and rejects every request.
function buildCanonical({ timestamp, nonce, method, url, body }) {
  return [
    SIGNATURE_VERSION,
    timestamp,
    nonce,
    String(method || 'GET').toUpperCase(),
    canonicalQuery(url && url.searchParams),
    hashBody(body),
  ].join(':');
}

/**
 * The four headers iimmpact expects, for one request.
 *
 * @param {object} args
 * @param {string} args.apiKey      X-Api-Key value.
 * @param {string} args.secretKey   base64 HMAC secret from the dashboard.
 * @param {string} args.method      HTTP method.
 * @param {URL} [args.url]          the request URL; only its query is signed.
 * @param {string|Buffer} [args.body] the exact body being sent, if any.
 * @param {number} [args.nowMs]     injectable clock, for tests.
 * @param {string} [args.nonce]     injectable nonce, for tests.
 */
function signIimmpactRequest({ apiKey, secretKey, method, url, body, nowMs, nonce }) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('iimmpact API key is not configured.');
  const secretBytes = decodeSecret(secretKey);
  const timestamp = String(Math.floor((Number.isFinite(nowMs) ? nowMs : Date.now()) / 1000));
  const requestNonce = nonce || `req-${timestamp}-${crypto.randomUUID().toLowerCase()}`;
  const canonical = buildCanonical({ timestamp, nonce: requestNonce, method, url, body });
  const signature = crypto.createHmac('sha256', secretBytes).update(canonical, 'utf8').digest('base64');
  return {
    'x-api-key': key,
    'x-timestamp': timestamp,
    'x-nonce': requestNonce,
    'x-signature': `${SIGNATURE_VERSION}=${signature}`,
  };
}

module.exports = { signIimmpactRequest, buildCanonical, canonicalQuery, hashBody, decodeSecret, SIGNATURE_VERSION };
