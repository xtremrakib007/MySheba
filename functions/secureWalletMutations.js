const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assertWalletUnfrozen } = require('./walletFreeze');
const { hasCapability } = require('./accessControl');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { logAudit, logServerError } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
// One session per platform: a phone and a browser can both be signed in,
// two phones cannot. See functions/sessionSlots.js.
const { sessionMatches } = require('./sessionSlots');

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
// Staff who may hold the 'finance' capability (functions/accessControl.js).
const ADMIN_ROLES = ['admin', 'superadmin', 'support', 'finance'];
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;
function requireSessionMatch(request, user) {
  const sessionId=request.data?.sessionId, deviceId=request.data?.deviceId;
  if(typeof sessionId!=='string'||!SESSION_ID_RE.test(sessionId)||typeof deviceId!=='string'||!DEVICE_ID_RE.test(deviceId)) throw new HttpsError('failed-precondition','Your secure session is missing. Please sign in again.');
  if(!sessionMatches(user, { sessionId, deviceId })) throw new HttpsError('permission-denied','This device session is no longer active. Please sign in again.');
}
const MAX_AMOUNT = 100000;

function requireRequest(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const requestId = request.data?.requestId;
  if (typeof requestId !== 'string' || !REQUEST_ID_RE.test(requestId)) throw new HttpsError('invalid-argument', 'requestId is required and must be 16-128 safe characters.');
  return { uid: request.auth.uid, requestId };
}
function safeText(value, max) { return String(value ?? '').trim().slice(0, max); }
function validMoney(value) { const n = Number(value); return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT && Number.isSafeInteger(Math.round(n * 100)) ? n : null; }
function validBalance(value) { const n = Number(value ?? 0); return Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100)) ? n : null; }
function active(account) { return !!account && account.suspended !== true && account.inactive !== true && account.disabled !== true && account.active !== false && account.mergedInto == null; }

exports.createSelfTopup = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const snap = await db.collection('users').doc(request.auth.uid).get();
  const profile = snap.exists ? (snap.data() || {}) : null;
  if (!profile || profile.disabled === true || profile.suspended === true || profile.inactive === true || profile.active === false) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
  assertWalletUnfrozen(profile, 'Your wallet');
  // Blueprint guardrail: an administrator must never mint wallet value by
  // directly increasing their own balance. Staff funding must come from an
  // approved funding mechanism/partner and move through the audited funding
  // workflow instead.
  throw new HttpsError(
    'failed-precondition',
    'Direct self-credit is disabled. Use the approved wallet funding workflow.'
  );
});
