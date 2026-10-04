'use strict';

// Who a provider callback actually came from, and which addresses are allowed.
//
// Most providers authenticate their callback with a shared secret in a header.
// Some do not: iimmpact's transaction callback carries no credential at all,
// only a fixed source address. Requiring a token would reject every one of
// their deliveries - so a webhook may instead name the addresses it will accept
// a callback FROM.
//
// An allowlist is weaker than a signature. It is a deliberate trade, taken
// because it is the strongest check the provider offers, and it only holds if
// the address being checked is the real one - which is the whole difficulty
// here.

const MAX_ALLOWED_IPS = 20;
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9A-Fa-f:]{2,45}$/;

/**
 * One address in the single form the allowlist compares.
 *
 * `::ffff:18.140.170.98` and `18.140.170.98` are the same address, and which
 * one arrives depends on the socket. An allowlist matching only the literal
 * string would pass in one environment and refuse every callback in the other.
 */
function normaliseIp(value) {
  let ip = String(value || '').trim().toLowerCase();
  if (!ip) return '';
  if (ip.startsWith('[')) {
    const close = ip.indexOf(']');
    ip = close === -1 ? ip.slice(1) : ip.slice(1, close);
  }
  // A trailing :port, but only when what precedes it is unmistakably IPv4 - a
  // bare IPv6 address is nothing but colons and would be cut at the first one.
  const withPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/);
  if (withPort) ip = withPort[1];
  if (ip.startsWith('::ffff:') && IPV4.test(ip.slice(7))) ip = ip.slice(7);
  return ip;
}

function isValidIp(value) {
  const ip = normaliseIp(value);
  return Boolean(ip) && (IPV4.test(ip) || IPV6.test(ip));
}

/**
 * The stored allowlist, from either an array or a comma/space separated string.
 * Throws on anything that is not an address, rather than silently dropping it -
 * a typo that vanished would leave an allowlist that refuses the real sender.
 */
function parseAllowedIps(value) {
  const list = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(/[\s,]+/) : []);
  const out = [];
  for (const entry of list) {
    const ip = normaliseIp(entry);
    if (!ip) continue;
    if (!isValidIp(ip)) throw new Error(`"${String(entry).slice(0, 60)}" is not a valid IP address.`);
    if (!out.includes(ip)) out.push(ip);
  }
  if (out.length > MAX_ALLOWED_IPS) throw new Error(`At most ${MAX_ALLOWED_IPS} webhook source addresses.`);
  return out;
}

/**
 * The address this request came from, as opposed to the one it claims.
 *
 * Google's front end APPENDS to any X-Forwarded-For the caller sent, so the
 * header reads `<whatever the caller wrote>, <the caller>, <the front end>`.
 * The caller's real address is therefore the SECOND-TO-LAST entry.
 *
 * The first entry is the obvious one to read and it is the one entry a caller
 * fully controls: reading it would let anyone onto the allowlist by sending
 * `X-Forwarded-For: 18.140.170.98` from anywhere in the world. That is the
 * mistake this function exists to not make.
 *
 * req.ip is not used either, because it answers from Express's trust-proxy
 * setting - not something to rely on for deciding whether a callback is real.
 */
function callbackSourceIp(req) {
  const header = req && req.headers ? req.headers['x-forwarded-for'] : undefined;
  const raw = Array.isArray(header) ? header.join(',') : String(header || '');
  const parts = raw.split(',').map((x) => normaliseIp(x)).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  // A single entry means nothing appended it, so there is no proxy hop to
  // discount; the socket is the fallback when the header is absent entirely.
  if (parts.length === 1) return parts[0];
  return normaliseIp(req && req.socket ? req.socket.remoteAddress : '');
}

/** True only when the source is known AND listed. An empty list allows nothing. */
function isAllowedSource(req, allowedIps) {
  const allowed = Array.isArray(allowedIps) ? allowedIps.map(normaliseIp).filter(Boolean) : [];
  if (!allowed.length) return false;
  const source = callbackSourceIp(req);
  return Boolean(source) && allowed.includes(source);
}

module.exports = { normaliseIp, isValidIp, parseAllowedIps, callbackSourceIp, isAllowedSource, MAX_ALLOWED_IPS };
