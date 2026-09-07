// Account-merge flow for "Link Google Account" when the Google account
// picked already backs a SEPARATE MySheba account.
//
// BACKGROUND: authService.linkGoogleAccount (see its own doc comment) uses
// Firebase's linkWithCredential to attach a Google credential onto the
// CURRENTLY signed-in account (uid A, normally a phone+PIN account) so the
// same uid can sign in either way. Firebase itself refuses that
// (auth/credential-already-in-use) if the Google account is already the
// primary sign-in for a different Firebase user (uid B) - which happens
// whenever this person previously used "Continue with Google" and
// ensureGoogleProfile (functions/googleAuth.js) auto-created a second,
// separate account for them. Historically the client just showed that as
// a dead-end error, leaving the person with two accounts and no way to
// combine them without losing whichever one's wallet points/game points
// they walked away from.
//
// This file adds a deliberate, explicit merge path for exactly that case:
//   1. startAccountMerge({ email })  - caller (signed in as uid A) names
//      the Google account's email address (the client already has it from
//      the native Google picker result - see
//      src/firebase/googleAuth.js:getGoogleIdTokenAndProfile). We look up
//      the Firebase Auth user that email actually backs (uid B), confirm
//      it really is a Google-linked account, and email a 6-digit code to
//      THAT address. Returns a masked preview (uid A and uid B's wallet/
//      game-point balances, and what they'd add up to) so the client can
//      show a confirmation dialog before anything is touched - this is
//      the "ask confirming by user" step.
//   2. confirmAccountMerge({ code }) - caller submits the code that
//      arrived in uid B's inbox. Only someone who can actually read that
//      inbox can supply it, which is what proves this is genuinely the
//      same person and not one account trying to siphon another's
//      points - the email OTP is the entire security boundary here, the
//      same trust model otpService.js already uses for registration.
//      Once verified: uid B's walletBalance and gamePoints balance are
//      ADDED into uid A's (nothing is lost from either side - see the
//      transaction below), uid B is flagged mergedInto/disabled rather
//      than deleted (so transaction/support-ticket history referencing
//      uid B stays intact), and the Google identity itself is moved from
//      uid B to uid A (admin.auth().updateUser providersToUnlink +
//      providerToLink) so uid A can sign in with that Google account from
//      now on, exactly as if linkGoogleAccount had succeeded directly.
//
// Deliberately restricted to role: 'customer' on BOTH sides - dealer/
// dealer/admin/reseller accounts carry dealer trees, business
// profiles, and staff permissions that a blind points-merge has no
// business touching automatically; those go through support instead.
//
// Client call sites: src/firebase/authService.js
// (startGoogleAccountMerge/confirmGoogleAccountMerge), wired up from
// SettingsScreen's "Link Google Account" via src/components/GoogleMergeModal.js.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { checkIpAnomaly } = require('./anomalyService');
const mailerService = require('./mailerService');

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; // code expires 5 minutes after it's sent
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 resend per minute per caller
const MAX_ATTEMPTS = 5; // wrong-code guesses allowed before the code is dead

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}
function generateCode() {
  let code = '';
  for (let i = 0; i < OTP_LENGTH; i++) code += Math.floor(Math.random() * 10);
  return code;
}
// "jamescarter@gmail.com" -> "ja***@gmail.com" - enough for the person to
// recognize which account this is, not enough to leak it to anyone reading
// over their shoulder or a captured client-side log.
function maskEmail(email) {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const shown = local.slice(0, Math.min(2, local.length));
  return `${shown}${'*'.repeat(Math.max(3, local.length - shown.length))}${email.slice(at)}`;
}

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

async function getProfile(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function getGamePointsBalance(db, uid) {
  const snap = await db.collection('gamePoints').doc(uid).get();
  return Number((snap.exists && snap.data().balance) || 0);
}

/** Step 1: caller names the Google account's email; we find the account it
 * actually backs, sanity-check it's eligible to merge, and email that
 * address a confirmation code. Nothing is changed yet - this is purely
 * "find + notify", so it's safe to call again (e.g. to resend the code,
 * subject to the same cooldown otpService uses). */
exports.startAccountMerge = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const caller = await getProfile(db, callerUid);
  if (!caller) throw new HttpsError('not-found', 'Your account could not be found.');
  if (caller.role !== 'customer') {
    throw new HttpsError(
      'permission-denied',
      'Account merging isn\u2019t available for this account type yet. Please contact support.'
    );
  }

  const email = normalizeEmail((request.data || {}).email);
  if (!isValidEmail(email)) {
    throw new HttpsError('invalid-argument', 'That doesn\u2019t look like a valid email address.');
  }
  if (caller.email && normalizeEmail(caller.email) === email) {
    throw new HttpsError('invalid-argument', 'That\u2019s already your account\u2019s email address.');
  }

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'account_merge_start', { ip });

  let targetAuthUser;
  try {
    targetAuthUser = await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err && err.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'No MySheba account uses that Google account yet - try linking again.');
    }
    await logServerError('startAccountMerge.getUserByEmail', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not look up that account. Please try again.');
  }

  if (targetAuthUser.uid === callerUid) {
    throw new HttpsError('invalid-argument', 'That\u2019s already your account.');
  }
  const hasGoogleProvider = (targetAuthUser.providerData || []).some((p) => p.providerId === 'google.com');
  if (!hasGoogleProvider) {
    throw new HttpsError('failed-precondition', 'That account isn\u2019t signed in with Google.');
  }

  const target = await getProfile(db, targetAuthUser.uid);
  if (!target) {
    throw new HttpsError('not-found', 'That account could not be found.');
  }
  if (target.mergedInto) {
    throw new HttpsError('failed-precondition', 'That account has already been merged into another one.');
  }
  if (target.role !== 'customer') {
    throw new HttpsError(
      'permission-denied',
      'That account can\u2019t be merged automatically. Please contact support.'
    );
  }

  const otpRef = db.collection('mergeOtps').doc(callerUid);
  const now = Date.now();
  const existing = await otpRef.get();
  if (existing.exists) {
    const data = existing.data();
    const lastSentMs = data.lastSentAt && data.lastSentAt.toMillis ? data.lastSentAt.toMillis() : 0;
    if (now - lastSentMs < RESEND_COOLDOWN_MS) {
      throw new HttpsError('resource-exhausted', 'Please wait a minute before requesting another code.');
    }
  }

  const code = generateCode();
  await otpRef.set({
    code,
    callerUid,
    targetUid: targetAuthUser.uid,
    targetEmail: email,
    expiresAt: admin.firestore.Timestamp.fromMillis(now + OTP_TTL_MS),
    lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
    attempts: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  try {
    await mailerService.sendEmail({
      to: email,
      subject: 'Confirm merging your MySheba accounts',
      text:
        `A MySheba account is requesting to link this Google account and combine wallets. ` +
        `Your confirmation code is ${code}. It expires in 5 minutes. ` +
        `If you didn't request this, you can ignore this email.`,
      html:
        `<p>A MySheba account is requesting to link this Google account and combine wallets.</p>` +
        `<p>Your confirmation code is <b>${code}</b>. It expires in 5 minutes.</p>` +
        `<p>If you didn't request this, you can ignore this email.</p>`,
      context: 'accountMergeService',
    });
  } catch (err) {
    throw new HttpsError('internal', 'Could not send the confirmation code. Please try again.');
  }

  await logAudit({
    action: 'account_merge_started',
    targetUid: targetAuthUser.uid,
    performedBy: callerUid,
    performedByRole: caller.role,
    details: { targetEmailMasked: maskEmail(email), ip },
  });

  const yourWalletBalance = Number(caller.walletBalance || 0);
  const targetWalletBalance = Number(target.walletBalance || 0);
  const yourGamePoints = await getGamePointsBalance(db, callerUid);
  const targetGamePoints = await getGamePointsBalance(db, targetAuthUser.uid);

  return {
    sent: true,
    emailMasked: maskEmail(email),
    yourWalletBalance,
    targetWalletBalance,
    combinedWalletBalance: yourWalletBalance + targetWalletBalance,
    yourGamePoints,
    targetGamePoints,
    combinedGamePoints: yourGamePoints + targetGamePoints,
  };
});

/** Step 2: caller submits the code emailed in step 1. On success, merges
 * uid B's wallet/game-point balances into uid A (additive, nothing lost),
 * marks uid B mergedInto/disabled instead of deleting it, and transfers
 * the Google sign-in identity itself from uid B to uid A. */
exports.confirmAccountMerge = onCall(async (request) => {
  const callerUid = requireAuth(request);
  const db = admin.firestore();
  const { code } = request.data || {};
  if (!code || String(code).trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Please enter the code we sent.');
  }

  const ip = getClientIp(request);
  await checkVelocity(db, callerUid, 'account_merge_confirm', { ip });

  const otpRef = db.collection('mergeOtps').doc(callerUid);
  const otpSnap = await otpRef.get();
  if (!otpSnap.exists) {
    throw new HttpsError('not-found', 'Please start the merge again from Settings.');
  }
  const otp = otpSnap.data();

  if (otp.attempts >= MAX_ATTEMPTS) {
    await logAudit({ action: 'account_merge_locked_out', targetUid: otp.targetUid, performedBy: callerUid, details: { ip } });
    throw new HttpsError('resource-exhausted', 'Too many incorrect attempts. Please start the merge again.');
  }
  const expiresMs = otp.expiresAt && otp.expiresAt.toMillis ? otp.expiresAt.toMillis() : 0;
  if (Date.now() > expiresMs) {
    throw new HttpsError('deadline-exceeded', 'That code has expired. Please start the merge again.');
  }
  if (String(code).trim() !== otp.code) {
    await otpRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
    throw new HttpsError('invalid-argument', 'Incorrect code. Please try again.');
  }

  const targetUid = otp.targetUid;
  const callerRef = db.collection('users').doc(callerUid);
  const targetRef = db.collection('users').doc(targetUid);
  const gpCallerRef = db.collection('gamePoints').doc(callerUid);
  const gpTargetRef = db.collection('gamePoints').doc(targetUid);

  let mergedWalletBalance = 0;
  let mergedGamePoints = 0;
  try {
    await db.runTransaction(async (tx) => {
      const [callerSnap, targetSnap, gpCallerSnap, gpTargetSnap] = await Promise.all([
        tx.get(callerRef),
        tx.get(targetRef),
        tx.get(gpCallerRef),
        tx.get(gpTargetRef),
      ]);
      if (!callerSnap.exists) throw new HttpsError('not-found', 'Your account could not be found.');
      if (!targetSnap.exists) throw new HttpsError('not-found', 'That account no longer exists.');
      const callerData = callerSnap.data();
      const targetData = targetSnap.data();
      if (targetData.mergedInto) {
        throw new HttpsError('failed-precondition', 'That account has already been merged into another one.');
      }
      if (callerData.role !== 'customer' || targetData.role !== 'customer') {
        throw new HttpsError('permission-denied', 'This account can\u2019t be merged automatically. Please contact support.');
      }

      const callerBalance = Number(callerData.walletBalance || 0);
      const targetBalance = Number(targetData.walletBalance || 0);
      mergedWalletBalance = callerBalance + targetBalance;

      const callerGp = Number((gpCallerSnap.exists && gpCallerSnap.data().balance) || 0);
      const targetGp = Number((gpTargetSnap.exists && gpTargetSnap.data().balance) || 0);
      mergedGamePoints = callerGp + targetGp;

      tx.update(callerRef, { walletBalance: mergedWalletBalance, googleLinked: true });
      tx.update(targetRef, {
        walletBalance: 0,
        mergedInto: callerUid,
        active: false,
        mergedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      if (gpCallerSnap.exists || gpTargetSnap.exists) {
        tx.set(
          gpCallerRef,
          { balance: mergedGamePoints, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
      if (gpTargetSnap.exists) {
        tx.set(gpTargetRef, { balance: 0, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('confirmAccountMerge.transaction', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not complete the merge. Please try again.');
  }

  // Points are safely combined and committed at this point regardless of
  // what happens below - a failure transferring the Google identity itself
  // is reported back to the client (providerLinkFailed) rather than
  // rolling back the points merge, since re-running "Link Google Account"
  // from Settings afterward is a safe, low-stakes retry on its own.
  let providerLinkFailed = false;
  try {
    const targetAuthUser = await admin.auth().getUser(targetUid);
    const googleProvider = (targetAuthUser.providerData || []).find((p) => p.providerId === 'google.com');
    if (googleProvider) {
      await admin.auth().updateUser(targetUid, { providersToUnlink: ['google.com'] });
      await admin.auth().updateUser(callerUid, {
        providerToLink: {
          providerId: 'google.com',
          uid: googleProvider.uid,
          email: googleProvider.email || otp.targetEmail,
        },
      });
    } else {
      providerLinkFailed = true;
    }
  } catch (err) {
    providerLinkFailed = true;
    await logServerError('confirmAccountMerge.providerTransfer', err, { userId: callerUid });
  }
  // Leftover account only ever had the Google credential we just moved -
  // disable it rather than leaving an orphaned, unreachable Auth user
  // lingering (same cleanup reasoning as ensureGoogleProfile's duplicate
  // cleanup in functions/googleAuth.js).
  await admin.auth().updateUser(targetUid, { disabled: true }).catch(() => {});
  await otpRef.delete().catch(() => {});

  await logAudit({
    action: 'account_merged',
    targetUid,
    performedBy: callerUid,
    performedByRole: 'customer',
    details: { mergedWalletBalance, mergedGamePoints, providerLinkFailed, ip },
  });

  return {
    merged: true,
    walletBalance: mergedWalletBalance,
    gamePoints: mergedGamePoints,
    googleLinked: !providerLinkFailed,
    providerLinkFailed,
  };
});
