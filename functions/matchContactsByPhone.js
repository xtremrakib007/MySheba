// Matches a batch of phone numbers (from the device's contact list) against
// registered MySheba accounts - backs the "Friends" screen's WhatsApp-style
// "people from your contacts who are on MySheba" section (see
// src/screens/FriendsListScreen.js). Same reasoning as searchUsers.js for
// why this has to run server-side: firestore.rules doesn't let a client
// read across every account, and phone numbers are exactly the kind of
// data that shouldn't be enumerable client-side anyway. The Admin SDK
// bypasses those rules and only ever hands back the same public-safe
// fields searchUsers.js does.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logServerError } = require('./logService');

function normalizeDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

// A cap on how many numbers one call can match, mirroring searchUsers.js's
// results cap - keeps a single request cheap even for someone with a huge
// device contact list, and the client only needs to call this once per
// Friends screen visit (not per keystroke like search), so this is plenty.
const MAX_NUMBERS = 1000;

exports.matchContactsByPhone = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerUid = request.auth.uid;
  const rawNumbers = Array.isArray(request.data && request.data.phoneNumbers)
    ? request.data.phoneNumbers
    : [];
  const wanted = new Set(
    rawNumbers.slice(0, MAX_NUMBERS).map(normalizeDigits).filter((d) => d.length >= 7)
  );
  if (wanted.size === 0) return { results: [] };

  const db = admin.firestore();
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

  return { results };
});
