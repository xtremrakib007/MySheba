// Matches device-contact phone numbers against registered MySheba accounts.
// Only public-safe picker fields are returned; the caller never receives
// arbitrary user documents.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logServerError } = require('./logService');

const MAX_NUMBERS = 500;
const MATCH_MAX = 5;
const MATCH_WINDOW_MS = 60 * 60 * 1000;

function normalizeDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

async function rateLimit(db, uid) {
  const ref = db.collection('userSearchVelocity').doc(`${uid}_contact_match`);
  const now = Date.now();
  const tripped = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const events = ((snap.exists && snap.data().events) || [])
      .filter((ts) => Number.isFinite(ts) && now - ts < MATCH_WINDOW_MS);
    if (events.length >= MATCH_MAX) {
      tx.set(ref, { events, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return true;
    }
    events.push(now);
    tx.set(ref, { events, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return false;
  });
  if (tripped) {
    throw new HttpsError('resource-exhausted', 'Too many contact matches. Please wait and try again.');
  }
}

exports.matchContactsByPhone = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const callerUid = request.auth.uid;
  const rawNumbers = Array.isArray(request.data && request.data.phoneNumbers)
    ? request.data.phoneNumbers
    : [];
  const wanted = new Set(
    rawNumbers.slice(0, MAX_NUMBERS).map(normalizeDigits).filter((d) => d.length >= 7)
  );
  if (wanted.size === 0) return { results: [] };

  const db = admin.firestore();
  await rateLimit(db, callerUid);

  let snap;
  try {
    snap = await db.collection('users').get();
  } catch (err) {
    await logServerError('matchContactsByPhone', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not match contacts right now.');
  }

  const results = [];
  snap.forEach((doc) => {
    if (doc.id === callerUid) return;
    const u = doc.data() || {};
    if (u.mergedInto) return;
    const phoneDigits = normalizeDigits(u.phone);
    if (!phoneDigits || !wanted.has(phoneDigits)) return;
    results.push({
      uid: doc.id,
      name: u.name || '',
      phone: u.phone || '',
      role: u.role || 'customer',
      userId: u.userId || '',
    });
  });

  return { results: results.slice(0, 100) };
});
