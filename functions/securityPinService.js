// Secondary security PIN service. The PIN hash is server-only in securityPins/{uid}.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { logAudit, logServerError } = require('./logService');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const RECENT_AUTH_WINDOW_MS = 10 * 60 * 1000;

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}
async function requireActiveAccount(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Your account could not be found.');
  const data = snap.data() || {};
  if (data.mergedInto != null || data.suspended === true || data.inactive === true || data.disabled === true || data.active === false) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
}
function requireRecentReauthentication(request) {
  const authTimeSeconds = Number(request.auth?.token?.auth_time);
  if (!Number.isFinite(authTimeSeconds) || authTimeSeconds <= 0) {
    throw new HttpsError('unauthenticated', 'Please sign in again before resetting your security PIN.');
  }
  const age = Date.now() - authTimeSeconds * 1000;
  if (age < 0 || age > RECENT_AUTH_WINDOW_MS) {
    throw new HttpsError('unauthenticated', 'Please re-authenticate before resetting your security PIN.');
  }
}
function isValidPin(pin) { return typeof pin === 'string' && /^\d{4,8}$/.test(pin); }
function pinDocRef(db, uid) { return db.collection('securityPins').doc(uid); }
function hashPin(pin, salt) {
  if (typeof salt !== 'string' || salt.length < 16) throw new Error('Invalid security PIN salt.');
  return crypto.scryptSync(pin, salt, 64).toString('hex');
}

exports.setupSecurityPin = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const { pin } = request.data || {};
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'PIN must be 4-8 digits.');
  const db = getFirestore();
  await requireActiveAccount(db, uid);
  const ref = pinDocRef(db, uid);
  const userRef = db.collection('users').doc(uid);
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPin(pin, salt);
    await db.runTransaction(async (tx) => {
      const [existing, userSnap] = await Promise.all([tx.get(ref), tx.get(userRef)]);
      if (!userSnap.exists) throw new HttpsError('not-found', 'Your account could not be found.');
      const userData = userSnap.data() || {};
      if (userData.mergedInto != null || userData.suspended === true || userData.inactive === true || userData.disabled === true || userData.active === false) throw new HttpsError('permission-denied', 'Your account is not active.');
      if (existing.exists) throw new HttpsError('already-exists', 'A security PIN is already set. Use reset instead.');
      tx.create(ref, { hash, salt, attempts: 0, lockedUntil: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      tx.set(userRef, { securityPinSet: true }, { merge: true });
    });
    await logAudit({ action: 'security_pin_setup', targetUid: uid, performedBy: uid, performedByRole: 'self', details: {} });
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('setupSecurityPin', err, { userId: uid });
    throw new HttpsError('internal', 'Could not set your security PIN.');
  }
});

exports.verifySecurityPin = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const { pin } = request.data || {};
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'Enter your PIN.');
  const db = getFirestore();
  await requireActiveAccount(db, uid);
  const ref = pinDocRef(db, uid);
  try {
    let result = null;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('failed-precondition', 'No security PIN is set up yet.');
      const data = snap.data() || {};
      let lockedUntil = 0;
      if (data.lockedUntil) {
        if (typeof data.lockedUntil.toMillis !== 'function') throw new Error('Invalid security PIN lockout timestamp.');
        lockedUntil = data.lockedUntil.toMillis();
      }
      if (lockedUntil > Date.now()) {
        const minutesLeft = Math.ceil((lockedUntil - Date.now()) / 60000);
        throw new HttpsError('resource-exhausted', `Too many attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`);
      }
      if (typeof data.hash !== 'string' || !/^[0-9a-f]{128}$/i.test(data.hash) || typeof data.salt !== 'string' || data.salt.length < 16) {
        throw new HttpsError('failed-precondition', 'Your security PIN needs to be reset before it can be used.');
      }
      const attemptHash = hashPin(pin, data.salt);
      const expected = Buffer.from(data.hash, 'hex');
      const actual = Buffer.from(attemptHash, 'hex');
      if (expected.length !== actual.length) throw new Error('Invalid security PIN hash length.');
      const ok = crypto.timingSafeEqual(actual, expected);
      if (ok) {
        tx.update(ref, { attempts: 0, lockedUntil: null, updatedAt: FieldValue.serverTimestamp() });
        result = { valid: true };
        return;
      }
      const attempts = Number.isInteger(data.attempts) && data.attempts >= 0 ? data.attempts + 1 : 1;
      if (attempts >= MAX_ATTEMPTS) {
        tx.update(ref, { attempts: 0, lockedUntil: Timestamp.fromMillis(Date.now() + LOCKOUT_MINUTES * 60000), updatedAt: FieldValue.serverTimestamp() });
        result = { locked: true };
        return;
      }
      tx.update(ref, { attempts, updatedAt: FieldValue.serverTimestamp() });
      result = { locked: false };
    });
    if (result?.valid) return result;
    if (result?.locked) throw new HttpsError('resource-exhausted', `Too many attempts. Try again in ${LOCKOUT_MINUTES} minutes.`);
    throw new HttpsError('permission-denied', 'Incorrect PIN.');
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('verifySecurityPin', err, { userId: uid });
    throw new HttpsError('internal', 'Could not verify your security PIN. Please try again.');
  }
});

exports.resetSecurityPin = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  requireRecentReauthentication(request);
  const { pin } = request.data || {};
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'PIN must be 4-8 digits.');
  const db = getFirestore();
  await requireActiveAccount(db, uid);
  const ref = pinDocRef(db, uid);
  const userRef = db.collection('users').doc(uid);
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'Your account could not be found.');
      const userData = userSnap.data() || {};
      if (userData.mergedInto != null || userData.suspended === true || userData.inactive === true || userData.disabled === true || userData.active === false) throw new HttpsError('permission-denied', 'Your account is not active.');
      tx.set(ref, { hash: hashPin(pin, salt), salt, attempts: 0, lockedUntil: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: false });
      tx.set(userRef, { securityPinSet: true }, { merge: true });
    });
    await logAudit({ action: 'security_pin_reset', targetUid: uid, performedBy: uid, performedByRole: 'self', details: {} });
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('resetSecurityPin', err, { userId: uid });
    throw new HttpsError('internal', 'Could not reset your security PIN.');
  }
});