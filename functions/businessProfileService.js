// Admin grant/revoke of the Business Profile premium feature.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');

function activeAccount(user) {
  return user && user.suspended !== true && user.inactive !== true && user.disabled !== true && !user.mergedInto;
}

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

async function requireAdmin(db, callerUid) {
  const snap = await db.collection('users').doc(callerUid).get();
  const caller = snap.exists ? snap.data() : null;
  if (!caller || !['admin', 'superadmin'].includes(caller.role)) {
    throw new HttpsError('permission-denied', 'Only an admin can manage Business Profiles.');
  }
  if (!activeAccount(caller)) throw new HttpsError('permission-denied', 'This admin account is not active.');
  return caller;
}

exports.setBusinessProfileStatus = onCall({ enforceAppCheck: true }, async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireAdmin(db, callerUid);

  const { targetUid, granted } = request.data || {};
  if (typeof targetUid !== 'string' || !targetUid.trim()) throw new HttpsError('invalid-argument', 'targetUid is required.');
  if (typeof granted !== 'boolean') throw new HttpsError('invalid-argument', 'granted must be true or false.');

  const targetRef = db.collection('users').doc(targetUid.trim());
  const bizRef = db.collection('businessProfiles').doc(targetUid.trim());

  try {
    await db.runTransaction(async tx => {
      const [callerSnap, targetSnap, bizSnap] = await Promise.all([
        tx.get(db.collection('users').doc(callerUid)),
        tx.get(targetRef),
        tx.get(bizRef),
      ]);
      const latestCaller = callerSnap.exists ? callerSnap.data() : null;
      if (!latestCaller || !['admin', 'superadmin'].includes(latestCaller.role) || !activeAccount(latestCaller)) {
        throw new HttpsError('permission-denied', 'This admin account is not active.');
      }
      if (!targetSnap.exists) throw new HttpsError('not-found', 'That user account no longer exists.');
      const target = targetSnap.data() || {};
      if (!activeAccount(target)) throw new HttpsError('failed-precondition', 'The target account is not active.');

      const update = {
        isBusinessProfile: granted,
        ...(granted
          ? { grantedAt: admin.firestore.FieldValue.serverTimestamp(), grantedBy: callerUid }
          : {}),
      };
      if (bizSnap.exists) {
        tx.update(bizRef, update);
      } else {
        tx.create(bizRef, {
          uid: targetUid.trim(),
          isBusinessProfile: granted,
          businessName: String(target.name || '').slice(0, 160),
          businessLogoUrl: '',
          businessDescription: '',
          businessCategory: '',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          grantedAt: granted ? admin.firestore.FieldValue.serverTimestamp() : null,
          grantedBy: granted ? callerUid : null,
        });
      }
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('setBusinessProfileStatus', err, { userId: callerUid, targetUid });
    throw new HttpsError('internal', "Could not update this user's Business Profile status.");
  }

  await logAudit({
    action: granted ? 'business_profile_granted' : 'business_profile_revoked',
    targetUid: targetUid.trim(),
    performedBy: callerUid,
    performedByRole: caller.role,
  });

  return { ok: true };
});
