'use strict';

// IIMMPACT's JWT login (POST /v2/token), for purchases only.
//
// IIMMPACT's current authentication is API key + HMAC, and MySheba signs
// every call that way. An account first set up on IIMMPACT's older JWT
// integration can still have its API key enabled only for the newer
// endpoints (catalogue, options, balance) while /v2/topup answers 403. For
// such an account the provider's "Purchase authentication" setting is JWT:
// the purchase carries `Authorization: Bearer <token>` from this login, and
// everything else keeps HMAC.
//
// The login is the provider's username and password (stored in Secret
// Manager like the API secret). The token is kept in memory and in
// iimmpactTokens/{providerId} (server-only) until shortly before it expires,
// so a purchase does not log in each time.
//
// IIMMPACT documents the reply as { AuthenticationResult: { IdToken,
// AccessToken, ExpiresIn, RefreshToken, TokenType } } and the ID token as
// the one to send. It is read a little defensively (top level or `data` too),
// so a moved field fails as "no token in the reply", never as a wrong token.

const TOKENS = 'iimmpactTokens';
const EARLY_MS = 2 * 60 * 1000;
const DEFAULT_LIFE_MS = 50 * 60 * 1000;
const memory = new Map();

function pick(obj, keys) {
  for (const key of keys) {
    const value = obj && obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/** The token and its lifetime in a /v2/token reply, or null. */
function tokenFrom(json) {
  if (!json || typeof json !== 'object') return null;
  const layers = [json, json.data, json.AuthenticationResult, json.data && json.data.AuthenticationResult]
    .filter((layer) => layer && typeof layer === 'object');
  let token = '';
  let refresh = '';
  let seconds = 0;
  for (const layer of layers) {
    // The ID token: IIMMPACT documents that its AccessToken is NOT accepted
    // by the API, so it is never a fallback.
    token = token || pick(layer, ['IdToken', 'idToken', 'id_token', 'token', 'jwt']);
    refresh = refresh || pick(layer, ['RefreshToken', 'refreshToken', 'refresh_token']);
    const life = Number(layer.ExpiresIn ?? layer.expiresIn ?? layer.expires_in);
    if (!seconds && Number.isFinite(life) && life > 0) seconds = life;
  }
  if (!token || /\s/.test(token) || token.length > 8000) return null;
  return { token, refresh, lifeMs: seconds ? seconds * 1000 : expiryFromJwt(token) };
}

/** Milliseconds until a JWT's own `exp`, or the default when it has none. */
function expiryFromJwt(token, now = Date.now()) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1] || '', 'base64url').toString('utf8'));
    const exp = Number(payload && payload.exp);
    if (Number.isFinite(exp) && exp * 1000 > now) return exp * 1000 - now;
  } catch (_) { /* not a JWT we can read: use the default */ }
  return DEFAULT_LIFE_MS;
}

function usable(entry, now = Date.now()) {
  return entry && entry.token && Number(entry.expiresAt) - EARLY_MS > now;
}

/**
 * A current token for this provider. `login(body)` performs the POST to
 * /v2/token and returns { ok, status, json } - injected, so the network call
 * goes through apiProviderService's pinned, public-host-only transport.
 */
async function getToken(db, provider, login, { force = false, now = Date.now() } = {}) {
  const id = String(provider?.id || 'default');
  if (!force && usable(memory.get(id), now)) return memory.get(id).token;
  const ref = db.collection(TOKENS).doc(id);
  if (!force) {
    const snap = await ref.get().catch(() => null);
    const saved = snap && snap.exists ? snap.data() : null;
    if (usable(saved, now)) {
      memory.set(id, { token: saved.token, expiresAt: Number(saved.expiresAt) });
      return saved.token;
    }
  }
  const username = String(provider?.username || '').trim();
  const password = String(provider?.password || '');
  if (!username || !password) throw new Error('IIMMPACT JWT purchases need the provider username and password.');
  const { ok, status, json } = await login({ username, password });
  if (!ok) {
    const said = json && typeof json === 'object' ? String(json.message || json.error?.message || json.error || '').slice(0, 200) : '';
    throw new Error(`IIMMPACT login failed (HTTP ${status}${said ? `: ${said}` : ''}).`);
  }
  const found = tokenFrom(json);
  if (!found) throw new Error('IIMMPACT login answered without a token.');
  const entry = { token: found.token, expiresAt: now + found.lifeMs };
  memory.set(id, entry);
  await ref.set({ ...entry, savedAt: new Date(now) }).catch(() => {});
  return entry.token;
}

/** Forgets a token IIMMPACT refused, so the next call logs in again. */
async function forget(db, provider) {
  const id = String(provider?.id || 'default');
  memory.delete(id);
  await db.collection(TOKENS).doc(id).delete().catch(() => {});
}

module.exports = { TOKENS, tokenFrom, expiryFromJwt, getToken, forget, _memory: memory };
