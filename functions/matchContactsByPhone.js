// Matches a batch of phone numbers against registered MySheba accounts.
// Phone matching is performed with indexed equality queries rather than a
// full users-collection scan. The endpoint returns only public-safe fields.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logServerError } = require('./logService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

function normalizeDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function isActiveProfile(profile) {
  return !!profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && !profile.mergedInto && profile.active !== false;
}

const MAX_NUMBERS = 250;
const IN_QUERY_LIMIT = 30;

function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

exports.matchContactsByPhone = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const callerUid = request.auth.uid;
  const db = admin.firestore();
  const callerSnap = await db.collection('users').doc(callerUid).get();
  if (!callerSnap.exists || !isActiveProfile(callerSnap.data() || {})) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'match_contacts_by_phone', { ip });

  const rawNumbers = Array.isArray(request.data && request.data.phoneNumbers)
    ? request.data.phoneNumbers
    : [];
  if (rawNumbers.length > MAX_NUMBERS) {
    throw new HttpsError('invalid-argument', `A maximum of ${MAX_NUMBERS} phone numbers can be matched at once.`);
  }
  const wantedDigits = [...new Set(rawNumbers.map(normalizeDigits).filter((d) => d.length >= 7))];
  if (wantedDigits.length === 0) return { results: [] };

  const wantedE164 = wantedDigits.map((d) => `+${d}`);
  const found = new Map();

  try {
    // Existing accounts may store either normalized digits or E.164 phone
    // values. Firestore `in` queries are bounded, so split the contact batch
    // into small indexed equality queries instead of scanning every account.
    for (const group of chunks(wantedE164, IN_QUERY_LIMIT)) {
      const snap = await db.collection('users').where('phoneE164', 'in', group).get();
      snap.forEach((doc) => found.set(doc.id, doc));
    }
    for (const group of chunks(wantedDigits, IN_QUERY_LIMIT)) {
      const snap = await db.collection('users').where('phone', 'in', group).get();
      snap.forEach((doc) => found.set(doc.id, doc));
    }
  } catch (err) {
    await logServerError('matchContactsByPhone', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not match contacts right now.');
  }

  const wanted = new Set(wantedDigits);
  const results = [];
  for (const doc of found.values()) {
    if (doc.id === callerUid) continue;
    const u = doc.data() || {};
    if (!isActiveProfile(u)) continue;
    const phoneCandidates = [u.phoneE164, u.phone].map(normalizeDigits).filter(Boolean);
    if (!phoneCandidates.some((phone) => wanted.has(phone))) continue;
    results.push({
      uid: doc.id,
      name: String(u.name || '').slice(0, 160),
      phone: String(u.phone || '').slice(0, 40),
      role: u.role || 'customer',
      userId: String(u.userId || '').slice(0, 40),
    });
  }

  return { results };
});