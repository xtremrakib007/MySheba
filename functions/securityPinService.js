// Secondary security PIN service. The PIN hash is server-only in securityPins/{uid}.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { logAudit, logServerError } = require('./logService');

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
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
  const db = getFirestore(); const ref = pinDocRef(db, uid);
  try {
    const existing = await ref.get();
    if (existing.exists) throw new HttpsError('already-exists', 'A security PIN is already set. Use reset instead.');
    const salt = crypto.randomBytes(16).toString('hex');
    await ref.set({ hash: hashPin(pin, salt), salt, attempts: 0, lockedUntil: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await db.collection('users').doc(uid).set({ securityPinSet: true }, { merge: true });
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
  const db = getFirestore(); const ref = pinDocRef(db, uid);
  try {
    const snap = await ref.get();
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
      await ref.update({ attempts: 0, lockedUntil: null });
      return { valid: true };
    }

    const attempts = Number.isInteger(data.attempts) && data.attempts >= 0 ? data.attempts + 1 : 1;
    const patch = { attempts };
    if (attempts >= MAX_ATTEMPTS) {
      patch.attempts = 0;
      patch.lockedUntil = Timestamp.fromMillis(Date.now() + LOCKOUT_MINUTES * 60000);
    }
    await ref.update(patch);
    if (patch.lockedUntil) throw new HttpsError('resource-exhausted', `Too many attempts. Try again in ${LOCKOUT_MINUTES} minutes.`);
    throw new HttpsError('permission-denied', 'Incorrect PIN.');
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('verifySecurityPin', err, { userId: uid });
    throw new HttpsError('internal', 'Could not verify your security PIN. Please try again.');
  }
});

exports.resetSecurityPin = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAuth(request);
  const { pin } = request.data || {};
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'PIN must be 4-8 digits.');
  const db = getFirestore(); const ref = pinDocRef(db, uid);
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    await ref.set({ hash: hashPin(pin, salt), salt, attempts: 0, lockedUntil: null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: false });
    await db.collection('users').doc(uid).set({ securityPinSet: true }, { merge: true });
    await logAudit({ action: 'security_pin_reset', targetUid: uid, performedBy: uid, performedByRole: 'self', details: {} });
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('resetSecurityPin', err, { userId: uid });
    throw new HttpsError('internal', 'Could not reset your security PIN.');
  }
});