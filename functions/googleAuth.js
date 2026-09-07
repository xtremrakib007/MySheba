// Backs Google Sign-In/Sign-Up (see src/firebase/authService.js
// signInWithGoogle / completeGoogleSignup). The client authenticates
// directly against Firebase Auth with the Google ID token
// (signInWithCredential) - that part never touches Cloud Functions. This
// function's job is to run right after, once, to make sure a matching
// users/{uid} profile exists:
//
//   - First time this uid has ever signed in, and no existing account
//     already uses this email, and a valid, not-already-used phone number
//     was given -> no profile yet -> create one as role: 'customer', with
//     a unique numeric userId (same reservation scheme as phone+PIN
//     registration and staff-created accounts - see userId.js). A phone
//     number is mandatory here, same "one phone per account" rule as
//     phone+PIN registration (functions/customerRegistration.js) - see the
//     phone check below.
//   - First time this uid has ever signed in, but no phone was given yet
//     -> throw PHONE_REQUIRED (see below) without creating anything or
//     touching the Auth user, so the client can prompt for a phone number
//     and call this again with it - src/screens/GooglePhoneScreen.js.
//   - First time this uid has ever signed in, but the email matches an
//     existing account (typically one created via phone+PIN sign-up,
//     using the same real email for OTP verification) -> refuse to create
//     a second profile - see the email check below.
//   - Returning Google user -> profile already exists -> just hand it back
//     untouched, so AppContext can route to the right dashboard.
//
// This has to run server-side rather than a plain client setDoc for the
// same reason as registerWithDealerCode: assigning userId needs the
// userIds/{id} reservation collection, which is admin-only under
// firestore.rules.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assignUniqueUserId } = require('./userId');
const { logAudit, logServerError } = require('./logService');

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function isValidPhone(phone) {
  return normalizePhone(phone).length >= 8;
}

exports.ensureGoogleProfile = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = admin.firestore();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (snap.exists) {
    return { uid, ...snap.data(), isNew: false };
  }

  // Google Sign-In collects no phone number of its own - a mobile number
  // is mandatory for every account (same "one phone per account" rule as
  // phone+PIN sign-up), so the very first Google sign-in for a brand-new
  // account must supply one. This throws a specific, non-user-facing
  // marker message (not shown as-is - see authService.signInWithGoogle,
  // which turns it into a needsPhone-flagged error) so the client can tell
  // "please collect a phone number and call me again" apart from a real
  // failure, without creating a profile OR touching the Auth user this
  // call auto-provisioned - that same uid is reused on the follow-up call
  // once a phone number is provided.
  const phone = normalizePhone((request.data || {}).phone);
  if (!isValidPhone(phone)) {
    throw new HttpsError('failed-precondition', 'PHONE_REQUIRED');
  }

  // One phone number, one account - same rule registerWithDealerCode
  // already enforces for phone+PIN sign-up
  // (functions/customerRegistration.js) and manageUser enforces for
  // staff-created accounts (functions/userManagement.js, via the
  // phone-derived synthetic email colliding in Firebase Auth). Google
  // accounts authenticate with the person's real email rather than that
  // synthetic address, so nothing else would ever catch a duplicate phone
  // here - this check is the only thing enforcing it for this signup path.
  const phoneSnap = await db.collection('users').where('phone', '==', phone).limit(1).get();
  if (!phoneSnap.empty) {
    // Same cleanup as the email-duplicate branch below: this uid was only
    // ever a throwaway auto-provisioned-by-signInWithCredential identity
    // with no profile - delete it rather than leaving it to linger and
    // hit this same block again.
    await admin.auth().deleteUser(uid).catch(() => {});
    throw new HttpsError('already-exists', 'This phone number is already registered to another account.');
  }

  // One email, one account - same rule registerWithDealerCode already
  // enforces for phone+PIN sign-up (functions/customerRegistration.js).
  // Google Sign-In auto-provisions its own brand-new Firebase Auth user
  // the very first time a given Google account signs in (see
  // signInWithGoogle in src/firebase/authService.js) - that uid is
  // unavoidably different from any existing phone+PIN account's uid, even
  // when it's the same real email address, because phone+PIN accounts
  // authenticate against a synthetic `<phone>@mysheba.app` address rather
  // than the person's real one. Left unchecked, that would leave two
  // separate profiles (two wallets, two roles, two everything) for what's
  // really one person. Instead: block a second profile from ever being
  // created here, and clean up the just-auto-created duplicate Auth user
  // (it has no profile and would only ever hit this same block again) so
  // it doesn't linger. The existing account keeps working via phone+PIN;
  // pairing this Google account to it instead of creating a new one is a
  // deliberate separate action - see linkGoogleAccount in
  // src/firebase/authService.js, wired up from Settings ("Link Google
  // Account") - which uses Firebase Auth's own linkWithCredential so the
  // SAME uid ends up authenticating for both, rather than trying to merge
  // two different uids after the fact.
  const email = normalizeEmail(token.email);
  if (email) {
    const emailSnap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!emailSnap.empty) {
      await admin.auth().deleteUser(uid).catch(() => {});
      throw new HttpsError(
        'already-exists',
        'An account with this email already exists. Sign in with your phone number and password, then use "Link Google Account" in Settings to enable Google sign-in for it.'
      );
    }
  }

  // Google sign-up has no dealer-code step in the UI today, but accepts an
  // optional one anyway (same resolution logic as registerWithDealerCode)
  // in case a future screen collects it - an unmatched/blank code just
  // leaves the account unassigned, same as self-registration without one.
  const { dealerCode, resellerCode } = request.data || {};
  let resolvedDealerId = null;
  const dealerDigits = normalizePhone(dealerCode);
  if (dealerDigits) {
    const dealerSnap = await db
      .collection('users')
      .where('phone', '==', dealerDigits)
      .where('role', 'in', ['dealer'])
      .limit(1)
      .get();
    if (!dealerSnap.empty) {
      const dealerDoc = dealerSnap.docs[0];
      const dealerData = dealerDoc.data();
      resolvedDealerId = dealerData.role === 'dealer' ? dealerData.dealerId : dealerDoc.id;
    }
  }

  // Same optional, best-effort resolution for a reseller code - see the
  // matching block in functions/customerRegistration.js.
  let resolvedResellerId = null;
  const resellerDigits = normalizePhone(resellerCode);
  if (resellerDigits) {
    const resellerSnap = await db
      .collection('users')
      .where('phone', '==', resellerDigits)
      .where('role', '==', 'reseller')
      .limit(1)
      .get();
    if (!resellerSnap.empty) {
      resolvedResellerId = resellerSnap.docs[0].id;
    }
  }

  const userId = await assignUniqueUserId(db, uid);
  const profile = {
    uid,
    userId,
    name: token.name || '',
    email,
    phone,
    role: 'customer',
    dealerId: resolvedDealerId,
    walletBalance: 0,
    notifPrefs: { pushEnabled: true, emailEnabled: true, rateAlerts: false },
    authProvider: 'google',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (resolvedResellerId) profile.resellerId = resolvedResellerId;
  try {
    await ref.set(profile);
    await logAudit({
      action: 'account_created',
      targetUid: uid,
      performedBy: 'system',
      performedByRole: null,
      details: { role: 'customer', dealerId: resolvedDealerId, resellerId: resolvedResellerId, method: 'google' },
    });
    return { uid, ...profile, isNew: true };
  } catch (err) {
    await logServerError('ensureGoogleProfile', err, { userId: uid });
    throw new HttpsError('internal', 'Could not create the account.');
  }
});
