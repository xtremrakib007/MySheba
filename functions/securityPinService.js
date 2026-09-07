// Secondary "security PIN" - a short (4-8 digit) PIN separate from the
// account's login password, required before viewing/sharing a document in
// My Documents, opening Notepad, or sending a Transfer Points payment (see
// requireSecurityPin() in AppContext.js and the screens that call it).
//
// The PIN itself never touches Firestore in a client-readable place: it's
// salted + hashed here with Node's built-in scrypt and stored in a
// separate `securityPins/{uid}` collection that firestore.rules denies all
// client access to (see the match block added there) - only these Admin
// SDK callables can read or write it. The public users/{uid} profile only
// ever gets a `securityPinSet: true/false` flag (also client-frozen, same
// pattern as walletBalance) so the UI knows whether to show "set up" vs
// "enter your PIN" without ever exposing the hash itself.
//
// Client call sites (see src/firebase/securityPinService.js):
//   setupSecurityPin  -> first-time PIN creation (securityPinSet must be false)
//   verifySecurityPin -> checks a PIN attempt against the stored hash
//   resetSecurityPin  -> overwrites an existing PIN; client re-authenticates
//                        with the account's login password first (same
//                        pattern as authService.changePassword), so this
//                        trusts the freshly-reauthenticated auth context
//                        rather than asking for the old security PIN too -
//                        that's what makes it usable as a genuine "forgot
//                        my PIN" reset, not just a change-while-you-remember-it.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');

const MAX_ATTEMPTS = 5; // consecutive wrong PINs before the account must use resetSecurityPin
const LOCKOUT_MINUTES = 15;

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}

function hashPin(pin, salt) {
  return crypto.scryptSync(pin, salt, 64).toString('hex');
}

function pinDocRef(db, uid) {
  return db.collection('securityPins').doc(uid);
}

/** First-time setup. Rejects if the account already has a PIN - use
 * resetSecurityPin to replace an existing one instead, so a stolen/logged-in
 * session can't silently swap out a PIN the real owner already set. */
exports.setupSecurityPin = onCall(async (request) => {
  const uid = requireAuth(request);
  const { pin } = request.data || {};
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'PIN must be 4-8 digits.');

  const db = admin.firestore();
  const ref = pinDocRef(db, uid);
  try {
    const existing = await ref.get();
    if (existing.exists) {
      throw new HttpsError('already-exists', 'A security PIN is already set. Use reset instead.');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPin(pin, salt);
    await ref.set({
      hash, salt, attempts: 0, lockedUntil: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('users').doc(uid).set({ securityPinSet: true }, { merge: true });
    await logAudit({ action: 'security_pin_setup', targetUid: uid, performedBy: uid, performedByRole: 'self', details: {} });
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('setupSecurityPin', err, { userId: uid });
    throw new HttpsError('internal', 'Could not set your security PIN.');
  }
});

/** Verifies a PIN attempt. Locks out further attempts for LOCKOUT_MINUTES
 * after MAX_ATTEMPTS consecutive wrong guesses in a row, so a stolen/left-
 * unlocked device can't be brute-forced against a 4-digit PIN. A correct
 * guess resets the counter. */
exports.verifySecurityPin = onCall(async (request) => {
  const uid = requireAuth(request);
  const { pin } = request.data || {};
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'Enter your PIN.');

  const db = admin.firestore();
  const ref = pinDocRef(db, uid);
  try {
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('failed-precondition', 'No security PIN is set up yet.');
    const data = snap.data();

    const lockedUntil = data.lockedUntil ? data.lockedUntil.toMillis() : 0;
    if (lockedUntil && lockedUntil > Date.now()) {
      const minutesLeft = Math.ceil((lockedUntil - Date.now()) / 60000);
      throw new HttpsError('resource-exhausted', `Too many attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`);
    }

    const attemptHash = hashPin(pin, data.salt);
    const ok = crypto.timingSafeEqual(Buffer.from(attemptHash, 'hex'), Buffer.from(data.hash, 'hex'));

    if (ok) {
      await ref.update({ attempts: 0, lockedUntil: null });
      return { valid: true };
    }

    const attempts = (data.attempts || 0) + 1;
    const patch = { attempts };
    if (attempts >= MAX_ATTEMPTS) {
      patch.attempts = 0;
      patch.lockedUntil = admin.firestore.Timestamp.fromMillis(Date.now() + LOCKOUT_MINUTES * 60000);
    }
    await ref.update(patch);

    if (patch.lockedUntil) {
      throw new HttpsError('resource-exhausted', `Too many attempts. Try again in ${LOCKOUT_MINUTES} minutes.`);
    }
    throw new HttpsError('permission-denied', 'Incorrect PIN.');
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('verifySecurityPin', err, { userId: uid });
    throw new HttpsError('internal', 'Could not verify your PIN.');
  }
});

/** Replaces an existing PIN (or creates one if somehow missing). Unlike
 * setupSecurityPin this doesn't require knowing the old PIN - the client
 * re-authenticates with the account's login password immediately before
 * calling this (see src/firebase/securityPinService.js), the same
 * "recent sign-in" pattern authService.changePassword already uses, so a
 * forgotten security PIN is always recoverable via the login password
 * without needing separate "forgot PIN" infrastructure. */
exports.resetSecurityPin = onCall(async (request) => {
  const uid = requireAuth(request);
  const { pin } = request.data || {};
  if (!isValidPin(pin)) throw new HttpsError('invalid-argument', 'PIN must be 4-8 digits.');

  const db = admin.firestore();
  const ref = pinDocRef(db, uid);
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPin(pin, salt);
    await ref.set({
      hash, salt, attempts: 0, lockedUntil: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: false });
    await db.collection('users').doc(uid).set({ securityPinSet: true }, { merge: true });
    await logAudit({ action: 'security_pin_reset', targetUid: uid, performedBy: uid, performedByRole: 'self', details: {} });
    return { ok: true };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('resetSecurityPin', err, { userId: uid });
    throw new HttpsError('internal', 'Could not reset your security PIN.');
  }
});
