'use strict';
// IIMMPACT JWT purchase login: token read from the reply, cached, refreshed.
const assert = require('assert');
const jwt = require('../functions/iimmpactJwt');

function fakeDb() {
  const store = new Map();
  return {
    store,
    collection: (name) => ({
      doc: (id) => ({
        get: async () => ({ exists: store.has(name + '/' + id), data: () => store.get(name + '/' + id) }),
        set: async (data) => { store.set(name + '/' + id, data); },
        delete: async () => { store.delete(name + '/' + id); },
      }),
    }),
  };
}

(async () => {
  assert.strictEqual(jwt.tokenFrom({ IdToken: 'a.b.c', ExpiresIn: 3600 }).token, 'a.b.c');
  assert.strictEqual(jwt.tokenFrom({ IdToken: 'a.b.c', ExpiresIn: 3600 }).lifeMs, 3600000);
  assert.strictEqual(jwt.tokenFrom({ data: { access_token: 'tok', expires_in: 60 } }).token, 'tok');
  assert.strictEqual(jwt.tokenFrom({ AuthenticationResult: { IdToken: 'x.y.z' } }).token, 'x.y.z');
  assert.strictEqual(jwt.tokenFrom({ message: 'Unauthorized' }), null);
  assert.strictEqual(jwt.tokenFrom({ token: 'has space' }), null, 'never a token with whitespace');
  const exp = Math.floor(Date.now() / 1000) + 600;
  const fake = ['e30', Buffer.from(JSON.stringify({ exp })).toString('base64url'), 'sig'].join('.');
  assert.ok(Math.abs(jwt.expiryFromJwt(fake) - 600000) < 2000, 'reads exp from the JWT when no ExpiresIn');

  const db = fakeDb();
  const provider = { id: 'p1', username: 'u', password: 'p' };
  let logins = 0;
  const login = async (body) => { logins += 1; assert.deepStrictEqual(body, { username: 'u', password: 'p' }); return { ok: true, status: 200, json: { IdToken: 't' + logins, ExpiresIn: 3600 } }; };
  assert.strictEqual(await jwt.getToken(db, provider, login), 't1');
  assert.strictEqual(await jwt.getToken(db, provider, login), 't1', 'cached in memory');
  jwt._memory.clear();
  assert.strictEqual(await jwt.getToken(db, provider, login), 't1', 'cached in Firestore');
  assert.strictEqual(logins, 1);
  assert.strictEqual(await jwt.getToken(db, provider, login, { force: true }), 't2', 'force logs in again');
  await jwt.forget(db, provider);
  assert.strictEqual(await jwt.getToken(db, provider, login), 't3', 'a forgotten token is replaced');
  assert.strictEqual(await jwt.getToken(db, provider, login, { now: Date.now() + 3600000 }), 't4', 'an expiring token is refreshed');

  await assert.rejects(jwt.getToken(db, { id: 'p2', username: '', password: '' }, login), /username and password/);
  await assert.rejects(jwt.getToken(db, { id: 'p3', username: 'u', password: 'p' }, async () => ({ ok: false, status: 401, json: { message: 'Incorrect username or password.' } })), /HTTP 401: Incorrect username or password/);
  console.log('iimmpactJwt tests: PASS');
})().catch((e) => { console.error(e); process.exit(1); });
