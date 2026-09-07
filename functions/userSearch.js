// Search every account by name, phone number, or numeric userId, regardless
// of role - backs the "Add contact" flow for starting a new direct chat (see
// src/screens/AddContactScreen.js) and the "New Group" member picker (see
// src/screens/NewGroupScreen.js). This MUST run server-side: firestore.rules
// deliberately does NOT let a customer read other users' profile docs, and
// dealer/dealer reads are scoped to their own dealer pool only - see the
// users/{uid} rule. So a plain client query can't back either picker. The
// Admin SDK bypasses those rules, and this function hands back only the
// public-safe fields a picker needs (uid, name, phone, role, userId) - never
// walletBalance, dealerId, pinHash-equivalent auth info, etc.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logServerError } = require('./logService');

function normalizeDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

exports.searchUsers = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerUid = request.auth.uid;
  const term = String((request.data && request.data.query) || '').trim();
  if (term.length < 2) return { results: [] };

  const db = admin.firestore();
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
    // Skip accounts merged away by the Google-account-merge flow
    // (functions/accountMergeService.js) - they're disabled in Auth and
    // have nothing of their own left; picking one here would start a chat
    // (or in transferPoints, send points) into a dead end.
    if (u.mergedInto) return;
    const nameLower = String(u.name || '').toLowerCase();
    const phoneDigits = normalizeDigits(u.phone);
    const userIdStr = String(u.userId || '');

    const nameMatch = nameLower.includes(termLower);
    const phoneMatch = termDigits.length > 0 && phoneDigits.includes(termDigits);
    const userIdMatch = termDigits.length > 0 && userIdStr.includes(termDigits);
    if (!nameMatch && !phoneMatch && !userIdMatch) return;

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

// Looks up one account by uid - backs the "Scan QR" add-contact flow (see
// src/screens/QRScanScreen.js). A scanned QR only carries a uid (see
// src/screens/MyQRCodeScreen.js, which encodes the owner's own uid/userId
// into the code they display); this function turns that into the same
// public-safe fields searchUsers returns, re-fetched fresh from Firestore
// rather than trusted from the QR payload itself, and rejects scanning your
// own code.
exports.getUserByUid = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerUid = request.auth.uid;
  const targetUid = String((request.data && request.data.uid) || '').trim();
  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'Missing uid.');
  }
  if (targetUid === callerUid) {
    throw new HttpsError('invalid-argument', 'That is your own code.');
  }

  const db = admin.firestore();
  let snap;
  try {
    snap = await db.collection('users').doc(targetUid).get();
  } catch (err) {
    await logServerError('getUserByUid', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not look up this account right now.');
  }

  if (!snap.exists) {
    throw new HttpsError('not-found', 'This account no longer exists.');
  }

  const u = snap.data() || {};
  if (u.mergedInto) {
    // Same reasoning as searchUsers above - this account was merged into
    // another one (functions/accountMergeService.js) and is now disabled.
    throw new HttpsError('not-found', 'This account no longer exists.');
  }
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
