const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const ALLOWED_ROLES = new Set(['dealer', 'reseller']);
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

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

function isActive(data) {
  return data && data.mergedInto == null && data.suspended !== true && data.inactive !== true && data.disabled !== true && data.active !== false;
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
    suspended: d.suspended === true,
    verificationStatus: typeof d.verificationStatus === 'string' ? d.verificationStatus : (d.verified === true ? 'approved' : 'unknown'),
    features: d.features && typeof d.features === 'object' && !Array.isArray(d.features) ? d.features : {},
    createdAt: d.createdAt?.toMillis ? d.createdAt.toMillis() : null,
  };
}

exports.listManagedUsers = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const callerRef = db.collection('users').doc(request.auth.uid);
  const callerSnap = await callerRef.get();
  if (!callerSnap.exists) throw new HttpsError('not-found', 'Your account was not found.');
  const caller = callerSnap.data() || {};
  // A disabled/suspended/inactive staff account must not retain access through
  // this callable merely because its role field is still dealer/reseller.
  if (!isActive(caller)) throw new HttpsError('permission-denied', 'Your account is not active.');
  if (!ALLOWED_ROLES.has(caller.role)) throw new HttpsError('permission-denied', 'This account cannot access a managed user list.');

  const field = caller.role === 'dealer' ? 'dealerId' : 'resellerId';
  const requestedSize = Number(request.data?.pageSize);
  const pageSize = Number.isInteger(requestedSize)
    ? Math.max(1, Math.min(MAX_PAGE_SIZE, requestedSize))
    : DEFAULT_PAGE_SIZE;
  const cursor = decodeCursor(request.data?.cursor);
  let query = db.collection('users')
    .where(field, '==', request.auth.uid)
    .orderBy('createdAt', 'desc')
    .limit(pageSize + 1);

  if (cursor) {
    const cursorSnap = await db.collection('users').doc(cursor.id).get();
    if (!cursorSnap.exists || cursorSnap.data()?.[field] !== request.auth.uid) {
      throw new HttpsError('invalid-argument', 'The requested page is no longer available. Please refresh the list.');
    }
    query = query.startAfter(cursorSnap);
  }

  const snap = await query.get();
  const hasMore = snap.docs.length > pageSize;
  const pageDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
  const results = pageDocs
    .filter((doc) => isActive(doc.data()))
    .map(sanitizeUser);

  return {
    results,
    nextPageCursor: hasMore ? encodeCursor(pageDocs[pageDocs.length - 1]) : null,
    hasMore,
  };
});
