// Search every account by name, phone number, or numeric userId, regardless
// of role. Results are intentionally limited to public-safe picker fields.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logServerError } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const SEARCH_MAX = 30;
const SEARCH_WINDOW_MS = 10 * 60 * 1000;
const QR_MAX = 60;
const QR_WINDOW_MS = 60 * 60 * 1000;
const SEARCH_SCAN_MAX = 1000;

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

exports.searchUsers = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const callerUid = request.auth.uid;
  const term = String((request.data && request.data.query) || '').trim().slice(0, 100);
  if (term.length < 2) return { results: [] };

  const db = admin.firestore();
  await rateLimit(db, callerUid, 'search', SEARCH_MAX, SEARCH_WINDOW_MS);

  const termLower = term.toLowerCase();
  const termDigits = normalizeDigits(term);
  const namePrefixes = [...new Set([
    term,
    termLower,
    term.charAt(0).toUpperCase() + term.slice(1).toLowerCase(),
    term.toUpperCase(),
  ].filter(Boolean))].slice(0, 4);
  const resultDocs = new Map();

  try {
    const queries = [];
    for (const prefix of namePrefixes) {
      queries.push(db.collection('users')
        .where('name', '>=', prefix)
        .where('name', '<', prefix + '\uf8ff')
        .limit(25)
        .get());
    }
    if (termDigits.length >= 2) {
      queries.push(db.collection('users').where('phone', '==', term).limit(25).get());
      queries.push(db.collection('users').where('phone', '==', '+' + termDigits).limit(25).get());
      queries.push(db.collection('users').where('userId', '==', termDigits).limit(25).get());
    }
    const snapshots = await Promise.all(queries);
    for (const snap of snapshots) {
      for (const doc of snap.docs) resultDocs.set(doc.id, doc);
    }
  } catch (err) {
    await logServerError('searchUsers', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not search users right now.');
  }

  const results = [];
  for (const doc of resultDocs.values()) {
    if (doc.id === callerUid) continue;
    const u = doc.data() || {};
    if (!isPublicActiveAccount(u)) continue;
    results.push({
      uid: doc.id,
      name: u.name || '',
      phone: u.phone || '',
      role: u.role || 'customer',
      userId: u.userId || '',
    });
  }

  results.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { results: results.slice(0, 25) };

  });
// QR lookup returns the same public-safe fields as searchUsers and never trusts
// the name/phone/userId embedded in a QR payload.
exports.getUserByUid = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
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

// Admin investigation search is deliberately separate from the public/contact
// search above. It can return email and inactive accounts, but only to staff
// roles that are allowed to use the Admin Investigation Center.
const INVESTIGATION_ROLES = new Set(['admin', 'superadmin', 'support', 'finance']);
const INVESTIGATION_MAX = 30;
const INVESTIGATION_WINDOW_MS = 60 * 1000;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function investigationPhoneCandidates(term) {
  const digits = normalizeDigits(term);
  if (!digits) return [];
  const candidates = new Set([digits, '+' + digits]);
  // Malaysia/local-format convenience: 012... can match 6012... / +6012...
  if (digits.startsWith('0') && digits.length >= 8) {
    const intl = '60' + digits.slice(1);
    candidates.add(intl);
    candidates.add('+' + intl);
  }
  return [...candidates];
}

async function requireInvestigationStaff(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Staff profile not found.');
  const profile = snap.data() || {};
  const role = String(profile.role || '').trim().toLowerCase();
  if (!INVESTIGATION_ROLES.has(role)) {
    throw new HttpsError('permission-denied', 'You are not allowed to search customer accounts.');
  }
  if (profile.suspended === true || profile.inactive === true || profile.disabled === true || profile.active === false || profile.mergedInto) {
    throw new HttpsError('permission-denied', 'Your staff account is not active.');
  }
  return profile;
}

exports.searchInvestigationUsers = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const callerUid = request.auth.uid;
  const term = String((request.data && request.data.query) || '').trim().slice(0, 150);
  if (term.length < 2) return { results: [] };

  const db = admin.firestore();
  await requireInvestigationStaff(db, callerUid);
  await rateLimit(db, callerUid, 'investigation', INVESTIGATION_MAX, INVESTIGATION_WINDOW_MS);

  const lower = normalizeEmail(term);
  const digits = normalizeDigits(term);
  const phoneCandidates = investigationPhoneCandidates(term);
  const resultDocs = new Map();

  try {
    const queries = [];
    const namePrefixes = [...new Set([
      term,
      lower,
      term.charAt(0).toUpperCase() + term.slice(1).toLowerCase(),
      term.toUpperCase(),
    ])].filter(Boolean).slice(0, 4);

    for (const prefix of namePrefixes) {
      queries.push(db.collection('users')
        .where('name', '>=', prefix)
        .where('name', '<', prefix + '\uf8ff')
        .limit(20)
        .get());
    }

    // Registration stores normalized lowercase email. Include exact and prefix
    // lookup so a pasted address or the beginning of an address works.
    if (term.includes('@')) {
      queries.push(db.collection('users').where('email', '==', lower).limit(20).get());
      queries.push(db.collection('users')
        .where('email', '>=', lower)
        .where('email', '<', lower + '\uf8ff')
        .limit(20)
        .get());
    }

    // Phone data exists in both legacy phone and normalized phoneE164.
    if (digits.length >= 2) {
      for (const candidate of phoneCandidates) {
        queries.push(db.collection('users').where('phone', '==', candidate).limit(20).get());
        queries.push(db.collection('users').where('phoneE164', '==', candidate).limit(20).get());
      }
      queries.push(db.collection('users').where('userId', '==', digits).limit(20).get());
    }

    // UID is the canonical fallback and does not require a Firestore query.
    const uidSnap = await db.collection('users').doc(term).get();
    if (uidSnap.exists) resultDocs.set(uidSnap.id, uidSnap);

    const snapshots = await Promise.all(queries);
    for (const snap of snapshots) {
      for (const d of snap.docs) resultDocs.set(d.id, d);
    }
  } catch (err) {
    await logServerError('searchInvestigationUsers', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not search accounts right now.');
  }

  const results = [];
  for (const d of resultDocs.values()) {
    const u = d.data() || {};
    results.push({
      uid: d.id,
      name: u.name || u.displayName || '',
      email: u.email || '',
      phone: u.phone || u.phoneNumber || u.phoneE164 || '',
      phoneE164: u.phoneE164 || '',
      role: u.role || 'customer',
      userId: u.userId || '',
      disabled: Boolean(u.disabled || u.suspended || u.inactive || u.active === false),
    });
  }

  results.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { results: results.slice(0, 25) };
});