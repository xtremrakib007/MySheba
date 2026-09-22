// Search every account by name, phone number, or numeric userId. Results are
// deliberately limited to public-safe contact fields.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logServerError } = require('./logService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const MAX_QUERY_LENGTH = 80;
const MAX_SCAN_RESULTS = 25;

function normalizeDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function publicUser(doc) {
  const u = doc.data() || {};
  return {
    uid: doc.id,
    name: String(u.name || '').slice(0, 160),
    phone: String(u.phone || '').slice(0, 40),
    role: u.role || 'customer',
    userId: String(u.userId || '').slice(0, 40),
  };
}

function discoverable(u) {
  return !u.mergedInto && u.suspended !== true && u.inactive !== true && u.disabled !== true;
}

exports.searchUsers = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const callerUid = request.auth.uid;
  const term = String(request.data?.query || '').trim();
  if (term.length < 2) return { results: [] };
  if (term.length > MAX_QUERY_LENGTH) throw new HttpsError('invalid-argument', 'Search query is too long.');

  const db = admin.firestore();
  await checkVelocity(db, callerUid, 'search_users', { ip: getClientIp(request) });

  let snap;
  try {
    // This remains intentionally server-side because client Firestore rules
    // do not expose arbitrary user profiles. The result payload contains
    // only contact-picker fields.
    snap = await db.collection('users').get();
  } catch (err) {
    await logServerError('searchUsers', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not search users right now.');
  }

  const termLower = term.toLowerCase();
  const termDigits = normalizeDigits(term);
  const results = [];
  snap.forEach((doc) => {
    if (doc.id === callerUid || results.length >= MAX_SCAN_RESULTS) return;
    const u = doc.data() || {};
    if (!discoverable(u)) return;
    const nameLower = String(u.name || '').toLowerCase();
    const phoneDigits = normalizeDigits(u.phoneE164 || u.phone);
    const userIdStr = String(u.userId || '');
    if (!nameLower.includes(termLower) &&
        !(termDigits && phoneDigits.includes(termDigits)) &&
        !(termDigits && userIdStr.includes(termDigits))) return;
    results.push(publicUser(doc));
  });

  results.sort((a, b) => a.name.localeCompare(b.name));
  return { results };
});

exports.getUserByUid = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const callerUid = request.auth.uid;
  const targetUid = String(request.data?.uid || '').trim();
  if (!targetUid || targetUid.length > 128) throw new HttpsError('invalid-argument', 'Missing or invalid uid.');
  if (targetUid === callerUid) throw new HttpsError('invalid-argument', 'That is your own code.');

  const db = admin.firestore();
  await checkVelocity(db, callerUid, 'get_user_by_uid', { ip: getClientIp(request) });

  let snap;
  try {
    snap = await db.collection('users').doc(targetUid).get();
  } catch (err) {
    await logServerError('getUserByUid', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not look up this account right now.');
  }
  if (!snap.exists || !discoverable(snap.data() || {})) {
    throw new HttpsError('not-found', 'This account no longer exists.');
  }
  return { result: publicUser(snap) };
});