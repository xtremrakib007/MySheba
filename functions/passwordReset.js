// Forgot Password - server half.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { assertPhoneVerified } = require('./phoneVerification');
const { assertEmailVerified } = require('./emailVerification');
const { logAudit, logServerError } = require('./logService');
const { checkAnonymousVelocity, getClientIp } = require('./rateLimitService');
const { signOutEverywhere } = require('./sessionSlots');

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

function toE164(phone, dialCode = '+60') {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/[^0-9]/g, '')}`;
  const digits = normalizePhone(phone).replace(/^0+/, '');
  const code = String(dialCode || '+60').replace(/[^0-9+]/g, '');
  return `${code.startsWith('+') ? code : `+${code}`}${digits}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function phoneLookupCandidates(phone, phoneE164, dialCode) {
  const e164 = toE164(phoneE164 || phone, dialCode);
  const e164Digits = normalizePhone(e164);
  const localDigits = normalizePhone(phone);
  const countryCode = normalizePhone(dialCode || '+60');
  const withoutCountry = e164Digits.startsWith(countryCode)
    ? e164Digits.slice(countryCode.length)
    : '';

  return {
    e164Candidates: unique([e164, `+${e164Digits}`]),
    phoneCandidates: unique([
      localDigits,
      e164Digits,
      `+${e164Digits}`,
      withoutCountry,
      withoutCountry ? `0${withoutCountry}` : '',
    ]),
    authEmailCandidates: unique([
      `${e164Digits}@mysheba.app`,
      `${localDigits}@mysheba.app`,
      `${withoutCountry}@mysheba.app`,
      `${withoutCountry ? `0${withoutCountry}` : ''}@mysheba.app`,
    ]),
  };
}

async function findUserByPhone(db, phone, phoneE164, dialCode) {
  const candidates = phoneLookupCandidates(phone, phoneE164, dialCode);

  if (candidates.e164Candidates.length) {
    const snap = await db.collection('users')
      .where('phoneE164', 'in', candidates.e164Candidates)
      .limit(1)
      .get();
    if (!snap.empty) return snap;
  }

  if (candidates.phoneCandidates.length) {
    const snap = await db.collection('users')
      .where('phone', 'in', candidates.phoneCandidates)
      .limit(1)
      .get();
    if (!snap.empty) return snap;
  }

  // Older accounts can have a phone value that was formatted with spaces,
  // dashes, or a different local/country-code representation. The login
  // system itself maps these representations to deterministic Firebase
  // Auth emails, so use Auth as a final account lookup. This avoids a costly
  // full Firestore users collection scan while still finding legacy users.
  for (const email of candidates.authEmailCandidates) {
    try {
      const authUser = await admin.auth().getUserByEmail(email);
      const profile = await db.collection('users').doc(authUser.uid).get();
      if (profile.exists) return { empty: false, docs: [profile] };
    } catch (err) {
      if (err && err.code !== 'auth/user-not-found') {
        await logServerError('resetPassword.lookupAuthUser', err, { email });
      }
    }
  }

  return { empty: true, docs: [] };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidPassword(pin) {
  const value = String(pin || '');
  return value.length >= 6 && value.length <= 20;
}

function isActiveAccount(profile) {
  return !!profile
    && profile.suspended !== true
    && profile.inactive !== true
    && profile.disabled !== true
    && profile.active !== false
    && profile.mergedInto == null;
}

function resetRateKey(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

exports.resetPassword = onCall({ enforceAppCheck: false }, async (request) => {
  const { phone, phoneE164, dialCode, email, newPassword, phoneIdToken, emailIdToken } = request.data || {};
  const normalizedPhone = normalizePhone(phone);
  const normalizedE164 = toE164(phoneE164 || phone, dialCode);
  const hasPhoneProof = typeof phoneIdToken === 'string' && phoneIdToken.length > 0;
  const hasEmailProof = typeof emailIdToken === 'string' && emailIdToken.length > 0;

  if (!normalizedPhone) throw new HttpsError('invalid-argument', 'Please enter a valid phone number.');
  if (!isValidPassword(newPassword)) throw new HttpsError('invalid-argument', 'Password must be 6-20 characters.');
  if (hasPhoneProof === hasEmailProof) {
    throw new HttpsError('invalid-argument', 'Please verify your phone or email first.');
  }

  const db = admin.firestore();

  try {
    await checkAnonymousVelocity(db, resetRateKey(normalizedE164), 'password_reset');
    const ip = getClientIp(request);
    if (ip) await checkAnonymousVelocity(db, resetRateKey(ip), 'password_reset_ip');
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('resetPassword.rateLimit', err, { lookup: 'phone' });
    throw new HttpsError('internal', 'Could not process your request right now. Please try again.');
  }

  let snap;
  try {
    snap = await findUserByPhone(db, phone, normalizedE164, dialCode);
  } catch (err) {
    await logServerError('resetPassword.findUserByPhone', err, { lookup: 'phone' });
    throw new HttpsError('internal', 'Could not find your account right now. Please try again.');
  }

  if (snap.empty) throw new HttpsError('not-found', 'No account found with that phone number.');

  const userDoc = snap.docs[0];
  const userData = userDoc.data();
  const realUid = userDoc.id;

  if (!isActiveAccount(userData)) {
    throw new HttpsError('permission-denied', 'This account is not active. Please contact support.');
  }

  if (hasPhoneProof) {
    try {
      await assertPhoneVerified(phoneIdToken, normalizedE164, undefined);
    } catch (err) {
      throw new HttpsError('failed-precondition', err.message || 'Please verify your phone number first.');
    }
  } else {
    const accountEmail = normalizeEmail(userData.email || '');
    if (!accountEmail) {
      throw new HttpsError('failed-precondition', 'This account has no email on file - please reset via SMS instead.');
    }
    if (normalizeEmail(email) !== accountEmail) {
      throw new HttpsError('failed-precondition', 'That email is not associated with this phone number.');
    }
    try {
      await assertEmailVerified(emailIdToken, accountEmail);
    } catch (err) {
      throw new HttpsError('failed-precondition', err.message || 'Please verify your email address first.');
    }
  }

  try {
    await admin.auth().updateUser(realUid, { password: String(newPassword) });
  } catch (err) {
    await logServerError('resetPassword.updateUser', err, { userId: realUid });
    throw new HttpsError('internal', 'Could not reset your password right now. Please try again.');
  }

  await admin.auth().revokeRefreshTokens(realUid).catch(() => {});
  await userDoc.ref.update({ ...signOutEverywhere(), pendingDeviceApproval: null }).catch(() => {});

  await logAudit({
    action: 'password_reset',
    targetUid: realUid,
    performedBy: realUid,
    performedByRole: userData.role,
    details: { via: hasPhoneProof ? 'sms' : 'email' },
  });

  return { success: true };
});
