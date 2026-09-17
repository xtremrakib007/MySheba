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
const { checkVelocity, getClientIp } = require('./rateLimitService');

function normalizeDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

// Contact matching reads the users collection server-side, so cap the batch
// size and rate-limit the endpoint to prevent an authenticated caller from
// repeatedly turning this into an expensive collection scan.
const MAX_NUMBERS = 250;

exports.matchContactsByPhone = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerUid = request.auth.uid;
  const ip = getClientIp(request);
  const db = admin.firestore();
  await checkVelocity(db, callerUid, 'match_contacts_by_phone', { ip });

  const rawNumbers = Array.isArray(request.data && request.data.phoneNumbers)
    ? request.data.phoneNumbers
    : [];
  if (rawNumbers.length > MAX_NUMBERS) {
    throw new HttpsError('invalid-argument', `A maximum of ${MAX_NUMBERS} phone numbers can be matched at once.`);
  }
  const wanted = new Set(
    rawNumbers.map(normalizeDigits).filter((d) => d.length >= 7)
  );
  if (wanted.size === 0) return { results: [] };

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
    // Suspended/inactive/disabled/merged accounts must not remain discoverable
    // through contact matching after access has been revoked.
    if (u.suspended === true || u.inactive === true || u.disabled === true || u.mergedInto) return;
    const phoneCandidates = [u.phoneE164, u.phone]
      .map(normalizeDigits)
      .filter(Boolean);
    if (!phoneCandidates.some((phone) => wanted.has(phone))) return;
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