// Admin grant/revoke of the "Business Profile" premium feature (PRD
// module. Unlike Verified (a user-submitted request/review flow - see
// verificationService.js), Business Profile is admin-initiated only: an
// admin picks an existing user (Admin Panel > Business Profiles screen)
// and grants or revokes it directly - there's no request queue.
//
// WHY THIS FILE EXISTS: firestore.rules blocks any client "create" on
// businessProfiles/{uid} entirely and freezes isBusinessProfile on every
// client update, so there is no client-writable path to the badge at all.
// This callable (Admin SDK) is the only thing that can grant/revoke it,
// and the only thing that ever creates the businessProfiles/{uid} doc in
// the first place (on first grant). Revoking just flips isBusinessProfile
// back to false and leaves the doc (and whatever businessName/logo/
// description the owner already set up via BusinessProfileService on the
// client) in place, so re-granting later doesn't lose their work.
//
// Client call site: src/firebase/businessProfileService.js
// setBusinessProfileStatus -> setBusinessProfileStatus

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');

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
  return caller;
}

/** Admin grants or revokes Business Profile status for a user. `granted:
 * true` on a user who has never had one creates businessProfiles/{uid},
 * pre-filled with their current account name as a starting businessName
 * (they can rename it, add a logo/description/category afterward from
 * their own Profile screen). On a user who already has a doc (e.g.
 * previously revoked), it just flips isBusinessProfile back to true.
 * `granted: false` flips it to false without touching anything else. */
exports.setBusinessProfileStatus = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await requireAdmin(db, callerUid);

  const { targetUid, granted } = request.data || {};
  if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');
  if (typeof granted !== 'boolean') throw new HttpsError('invalid-argument', 'granted must be true or false.');

  const targetRef = db.collection('users').doc(targetUid);
  const bizRef = db.collection('businessProfiles').doc(targetUid);

  try {
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'That user account no longer exists.');
    const target = targetSnap.data();

    const bizSnap = await bizRef.get();
    if (bizSnap.exists) {
      await bizRef.update({
        isBusinessProfile: granted,
        ...(granted
          ? { grantedAt: admin.firestore.FieldValue.serverTimestamp(), grantedBy: callerUid }
          : {}),
      });
    } else {
      await bizRef.set({
        uid: targetUid,
        isBusinessProfile: granted,
        businessName: target.name || '',
        businessLogoUrl: '',
        businessDescription: '',
        businessCategory: '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        grantedAt: granted ? admin.firestore.FieldValue.serverTimestamp() : null,
        grantedBy: callerUid,
      });
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('setBusinessProfileStatus', err, { userId: callerUid, targetUid });
    throw new HttpsError('internal', "Could not update this user's Business Profile status.");
  }

  await logAudit({
    action: granted ? 'business_profile_granted' : 'business_profile_revoked',
    targetUid,
    performedBy: callerUid,
    performedByRole: caller.role,
  });

  return { ok: true };
});
