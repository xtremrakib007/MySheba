const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { hasCapability } = require('./accessControl');

const DEFAULT_PAGE_SIZE = 250;
const MAX_PAGE_SIZE = 500;
const STAFF_ROLES = new Set(['admin', 'superadmin']);

function decodeCursor(value) {
  if (!value) return null;
  try {
    const decoded = Buffer.from(String(value), 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed.id !== 'string' || parsed.id.length > 128) return null;
    return parsed;
  } catch {
    return null;
  }
}

function encodeCursor(doc) {
  return Buffer.from(JSON.stringify({ id: doc.id }), 'utf8').toString('base64url');
}

function active(profile) {
  return !!profile &&
    profile.suspended !== true &&
    profile.inactive !== true &&
    profile.disabled !== true &&
    profile.mergedInto == null &&
    profile.active !== false;
}

function timestampValue(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') {
    const millis = value.toMillis();
    return {
      seconds: Math.floor(millis / 1000),
      nanoseconds: (millis % 1000) * 1000000,
    };
  }
  if (typeof value.seconds === 'number') {
    return {
      seconds: value.seconds,
      nanoseconds: typeof value.nanoseconds === 'number' ? value.nanoseconds : 0,
    };
  }
  return null;
}

function sanitizeUser(doc) {
  const d = doc.data() || {};
  return {
    id: doc.id,
    name: typeof d.name === 'string' ? d.name : '',
    phone: typeof d.phone === 'string' ? d.phone : '',
    role: typeof d.role === 'string' ? d.role : 'customer',
    userId: typeof d.userId === 'string' ? d.userId : '',
    dealerId: typeof d.dealerId === 'string' ? d.dealerId : null,
    resellerId: typeof d.resellerId === 'string' ? d.resellerId : null,
    walletBalance: typeof d.walletBalance === 'number' ? d.walletBalance : 0,
    suspended: d.suspended === true,
    verificationStatus: typeof d.verificationStatus === 'string'
      ? d.verificationStatus
      : (d.verified === true ? 'approved' : 'unknown'),
    features: d.features && typeof d.features === 'object' && !Array.isArray(d.features)
      ? d.features
      : {},
    createdAt: timestampValue(d.createdAt),
  };
}

async function getAuthorizedCaller(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const db = admin.firestore();
  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists) {
    throw new HttpsError('not-found', 'Your account was not found.');
  }

  const caller = callerSnap.data() || {};
  if (!active(caller) || !STAFF_ROLES.has(caller.role)) {
    throw new HttpsError('permission-denied', 'Your account cannot access this user list.');
  }

  if (caller.role === 'admin' && !(await hasCapability(db, request.auth.uid, caller, 'users'))) {
    throw new HttpsError('permission-denied', 'Your account does not manage users.');
  }

  return { db, caller };
}

exports.listUserDirectory = onCall({ enforceAppCheck: false }, async (request) => {
  const { db, caller } = await getAuthorizedCaller(request);
  const type = String(request.data?.type || 'managed');

  const requestedSize = Number(request.data?.pageSize);
  const pageSize = Number.isInteger(requestedSize)
    ? Math.max(1, Math.min(MAX_PAGE_SIZE, requestedSize))
    : DEFAULT_PAGE_SIZE;

  const cursor = decodeCursor(request.data?.cursor);
  let cursorSnap = null;

  if (cursor) {
    cursorSnap = await db.collection('users').doc(cursor.id).get();
    if (!cursorSnap.exists) {
      throw new HttpsError('invalid-argument', 'The requested page is no longer available. Please refresh the list.');
    }
  }

  if (type === 'dealers' || type === 'resellers') {
    const role = type === 'dealers' ? 'dealer' : 'reseller';
    let query = db.collection('users')
      .where('role', '==', role)
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1);

    if (cursorSnap) query = query.startAfter(cursorSnap);

    const snap = await query.get();
    const hasMore = snap.docs.length > pageSize;
    const pageDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

    return {
      results: pageDocs.filter((doc) => active(doc.data())).map(sanitizeUser),
      nextPageCursor: hasMore ? encodeCursor(pageDocs[pageDocs.length - 1]) : null,
      hasMore,
    };
  }

  if (type === 'all') {
    if (caller.role !== 'superadmin') {
      throw new HttpsError('permission-denied', 'Only a superadmin can access the full user directory.');
    }

    let query = db.collection('users')
      .orderBy('createdAt', 'desc')
      .limit(pageSize + 1);

    if (cursorSnap) query = query.startAfter(cursorSnap);

    const snap = await query.get();
    const hasMore = snap.docs.length > pageSize;
    const pageDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

    return {
      results: pageDocs.map(sanitizeUser),
      nextPageCursor: hasMore ? encodeCursor(pageDocs[pageDocs.length - 1]) : null,
      hasMore,
    };
  }

  let allowedRoles;
  if (caller.role === 'superadmin') {
    allowedRoles = ['admin', 'dealer', 'reseller', 'customer'];
  } else {
    allowedRoles = ['dealer', 'reseller', 'customer'];
  }

  if (type !== 'managed' && type !== 'unassigned') {
    throw new HttpsError('invalid-argument', 'Unsupported user list.');
  }

  if (type === 'unassigned') {
    // Unassigned customers historically do not all have dealerId set, so
    // filtering for dealerId == null would miss older documents. Keep the
    // Firestore query bounded and filter the missing field server-side.
    let nextCursorSnap = cursorSnap;
    const results = [];
    let hasMore = false;

    while (results.length < pageSize) {
      let query = db.collection('users')
        .where('role', '==', 'customer')
        .orderBy('createdAt', 'desc')
        .limit(pageSize + 1);

      if (nextCursorSnap) query = query.startAfter(nextCursorSnap);

      const snap = await query.get();
      if (snap.empty) break;

      hasMore = snap.docs.length > pageSize;
      const pageDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

      for (const doc of pageDocs) {
        const data = doc.data() || {};
        if (!data.dealerId) results.push(sanitizeUser(doc));
        nextCursorSnap = doc;
        if (results.length >= pageSize) break;
      }

      if (!hasMore) break;
    }

    return {
      results,
      nextPageCursor: hasMore && nextCursorSnap ? encodeCursor(nextCursorSnap) : null,
      hasMore,
    };
  }

  let query = db.collection('users')
    .where('role', 'in', allowedRoles)
    .orderBy('createdAt', 'desc')
    .limit(pageSize + 1);

  if (cursorSnap) query = query.startAfter(cursorSnap);

  const snap = await query.get();
  const hasMore = snap.docs.length > pageSize;
  const pageDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

  return {
    results: pageDocs.map(sanitizeUser),
    nextPageCursor: hasMore ? encodeCursor(pageDocs[pageDocs.length - 1]) : null,
    hasMore,
  };
});
