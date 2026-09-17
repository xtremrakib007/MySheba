// Search every account by name, phone number, or numeric userId, regardless
// of role. Results are intentionally limited to public-safe picker fields.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logServerError } = require('./logService');

const SEARCH_MAX = 30;
const SEARCH_WINDOW_MS = 10 * 60 * 1000;
const QR_MAX = 60;
const QR_WINDOW_MS = 60 * 60 * 1000;

function normalizeDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function isPublicActiveAccount(u) {
  return u && u.mergedInto == null && u.suspended !== true && u.inactive !== true && u.disabled !== true && u.active !== false;
}

async function rateLimit(db, uid, action, max, windowMs) {
  const ref = db.collection('userSearchVelocity').doc(`${uid}_${action}`);
  const now = Date.now();
  const tripped = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const events = ((snap.exists && snap.data().events) || [])
      .filter((ts) => Number.isFinite(ts) && now - ts < windowMs);
    if (events.length >= max) {
      tx.set(ref, { events, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return true;
    }
    events.push(now);
    tx.set(ref, { events, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return false;
  });
  if (tripped) {
    throw new HttpsError('resource-exhausted', 'Too many account lookups. Please wait and try again.');
  }
}

exports.searchUsers = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const callerUid = request.auth.uid;
  const term = String((request.data && request.data.query) || '').trim().slice(0, 100);
  if (term.length < 2) return { results: [] };

  const db = admin.firestore();
  await rateLimit(db, callerUid, 'search', SEARCH_MAX, SEARCH_WINDOW_MS);

  let snap;
  try {
    snap = await db.collection('users').get();
  } catch (err) {
    await logServerError('searchUsers', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not search users right now.');
  }

  const termLower = term.toLowerCase();
  const termDigits = normalizeDigits(term);
  const results = [];

  snap.forEach((doc) => {
    if (doc.id === callerUid) return;
    const u = doc.data() || {};
    if (!isPublicActiveAccount(u)) return;
    const nameLower = String(u.name || '').toLowerCase();
    const phoneDigits = normalizeDigits(u.phone);
    const userIdStr = String(u.userId || '');
    if (!nameLower.includes(termLower)
      && !(termDigits.length > 0 && phoneDigits.includes(termDigits))
      && !(termDigits.length > 0 && userIdStr.includes(termDigits))) return;
    results.push({
      uid: doc.id,
      name: u.name || '',
      phone: u.phone || '',
      role: u.role || 'customer',
      userId: u.userId || '',
    });
  });

  results.sort((a, b) => a.name.localeCompare(b.name));
  return { results: results.slice(0, 25) };
});

// QR lookup returns the same public-safe fields as searchUsers and never trusts
// the name/phone/userId embedded in a QR payload.
exports.getUserByUid = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const callerUid = request.auth.uid;
  const targetUid = String((request.data && request.data.uid) || '').trim();
  if (!targetUid || targetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'Missing uid.');
  }
  if (targetUid === callerUid) throw new HttpsError('invalid-argument', 'That is your own code.');

  const db = admin.firestore();
  await rateLimit(db, callerUid, 'qr', QR_MAX, QR_WINDOW_MS);

  let snap;
  try {
    snap = await db.collection('users').doc(targetUid).get();
  } catch (err) {
    await logServerError('getUserByUid', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not look up this account right now.');
  }
  if (!snap.exists) throw new HttpsError('not-found', 'This account no longer exists.');

  const u = snap.data() || {};
  if (!isPublicActiveAccount(u)) throw new HttpsError('not-found', 'This account no longer exists.');
  return {
    result: {
      uid: snap.id,
      name: u.name || '',
      phone: u.phone || '',
      role: u.role || 'customer',
      userId: u.userId || '',
    },
  };
});
