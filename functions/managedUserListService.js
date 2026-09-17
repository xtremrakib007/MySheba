const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const ALLOWED_ROLES = new Set(['dealer', 'reseller']);
const MAX_RESULTS = 500;

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

exports.listManagedUsers = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const callerRef = db.collection('users').doc(request.auth.uid);
  const callerSnap = await callerRef.get();
  if (!callerSnap.exists) throw new HttpsError('not-found', 'Your account was not found.');
  const caller = callerSnap.data() || {};
  if (!ALLOWED_ROLES.has(caller.role)) throw new HttpsError('permission-denied', 'This account cannot access a managed user list.');

  const field = caller.role === 'dealer' ? 'dealerId' : 'resellerId';
  const snap = await db.collection('users').where(field, '==', request.auth.uid).limit(MAX_RESULTS).get();
  const results = snap.docs
    .filter((doc) => isActive(doc.data()))
    .map(sanitizeUser)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { results, truncated: snap.size >= MAX_RESULTS };
});
