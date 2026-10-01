const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { hasCapability } = require('./accessControl');
const { inferWalletCurrency } = require('./walletCurrencyService');
const ZERO_DECIMAL_CURRENCIES = new Set(['IDR', 'KHR', 'MMK']);
const { logAudit, logServerError } = require('./logService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const ADMIN_ROLES = ['admin', 'superadmin', 'support', 'finance'];
const ALLOWED_RECIPIENT_ROLES = ['customer', 'dealer', 'reseller'];
const MAX_AMOUNT = 100000;
const MONEY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;

function requireSessionMatch(request, profile) {
  const sessionId = request.data?.sessionId;
  const deviceId = request.data?.deviceId;
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId) || typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    throw new HttpsError('failed-precondition', 'Your secure session is missing. Please sign in again.');
  }
  if (profile.activeSessionId !== sessionId || profile.activeDeviceId !== deviceId) {
    throw new HttpsError('permission-denied', 'This device session is no longer active. Please sign in again.');
  }
}

function requireAdmin(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

function activeAccount(profile) {
  return !!profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && profile.active !== false && profile.mergedInto == null;
}

function validMoney(value, currency = 'MYR') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) return null;
    const scale = 10 ** (ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2);
    const cents = Math.round(value * scale);
    if (!Number.isSafeInteger(cents) || Math.abs(value * scale - cents) > Number.EPSILON * Math.max(1, Math.abs(value * scale))) return null;
    return value;
  }
  if (typeof value !== 'string' || (ZERO_DECIMAL_CURRENCIES.has(currency) ? !/^\d+$/.test(value) : !MONEY_RE.test(value))) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT ? n : null;
}

function validBalance(value) {
  const raw = value;
  const n = raw == null ? 0 : Number(raw);
  if (raw != null && typeof raw === 'string' && !MONEY_RE.test(raw)) return null;
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) return null;
  return n;
}

// Who may release money. Verifying is the finance capability (finance role,
// and superadmin, which no override can restrict); completing is admin or
// superadmin. A superadmin may do both steps, so a top-up is never stuck
// waiting for someone else to be online.
const COMPLETER_ROLES = ['admin', 'superadmin'];

/** Everything needed to credit a wallet, or an HttpsError saying why not. */
async function creditPlan(tx, db, topup) {
  const userId = String(topup.userId || '').trim();
  if (!userId) throw new HttpsError('failed-precondition', 'Top-up has no valid user account.');
  const userRef = db.collection('users').doc(userId);
  const userSnap = await tx.get(userRef);
  if (!userSnap.exists) throw new HttpsError('not-found', 'That user account no longer exists.');
  const user = userSnap.data() || {};
  if (!activeAccount(user)) throw new HttpsError('failed-precondition', 'The recipient account is not active.');
  if (!ALLOWED_RECIPIENT_ROLES.includes(user.role)) throw new HttpsError('failed-precondition', 'That account cannot receive wallet top-ups.');
  const currency = inferWalletCurrency(user);
  const requestedCurrency = String(topup.currency || '').toUpperCase();
  if (requestedCurrency && requestedCurrency !== currency) throw new HttpsError('failed-precondition', `Top-up currency ${requestedCurrency} does not match the user's wallet currency ${currency}.`);
  const points = validMoney(topup.walletAmount ?? topup.points ?? topup.amount, currency);
  const balance = validBalance(user.walletBalance);
  if (points === null) throw new HttpsError('failed-precondition', 'Top-up amount is invalid.');
  if (balance === null) throw new HttpsError('failed-precondition', 'User wallet balance is invalid.');
  const scale = 10 ** (ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2);
  const newBalanceCents = Math.round(balance * scale) + Math.round(points * scale);
  if (!Number.isSafeInteger(newBalanceCents)) throw new HttpsError('failed-precondition', 'Wallet balance is too large.');
  return { userId, userRef, currency, points, newBalance: newBalanceCents / scale };
}

/** Load the caller and re-check them inside the transaction. */
async function callerInTx(tx, db, uid, request) {
  const snap = await tx.get(db.collection('users').doc(uid));
  if (!snap.exists || !activeAccount(snap.data())) throw new HttpsError('permission-denied', 'Your account is not active.');
  const caller = snap.data() || {};
  requireSessionMatch(request, caller);
  return caller;
}

const actor = (uid, caller) => ({ uid, name: caller.name || caller.displayName || '', role: caller.role || '' });

// ---- step 1: finance checks the payment is real. No money moves. ----
exports.verifyTopup = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const uid = requireAdmin(request);
  const db = admin.firestore();
  const topupId = String(request.data?.topupId || request.data?.id || '').trim();
  if (!topupId) throw new HttpsError('invalid-argument', 'topupId is required.');
  const ref = db.collection('topups').doc(topupId);
  try {
    const out = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const caller = await callerInTx(tx, db, uid, request);
      if (!(await hasCapability(db, uid, caller, 'finance'))) throw new HttpsError('permission-denied', 'Your account cannot verify top-ups.');
      if (!snap.exists) throw new HttpsError('not-found', 'That top-up request does not exist.');
      const topup = snap.data() || {};
      if (topup.status !== 'pending') throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      // Checked now so a request cannot be verified and then fail to complete.
      await creditPlan(tx, db, topup);
      const who = actor(uid, caller);
      tx.update(ref, {
        status: 'verified',
        verifiedBy: who.uid, verifiedByName: who.name, verifiedByRole: who.role,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { userId: topup.userId || '', role: who.role };
    });
    await logAudit({ action: 'topup_verified', targetUid: out.userId, performedBy: uid, performedByRole: out.role, details: { topupId } });
    return { verified: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('verifyTopup', error, { userId: uid, topupId });
    throw new HttpsError('internal', 'Could not verify that top-up.');
  }
});

// ---- step 2: admin releases the money. ----
exports.completeTopup = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const uid = requireAdmin(request);
  const db = admin.firestore();
  const topupId = String(request.data?.topupId || request.data?.id || '').trim();
  if (!topupId) throw new HttpsError('invalid-argument', 'topupId is required.');
  const ref = db.collection('topups').doc(topupId);
  try {
    const out = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const caller = await callerInTx(tx, db, uid, request);
      if (!COMPLETER_ROLES.includes(caller.role)) throw new HttpsError('permission-denied', 'Only an admin or superadmin can complete a top-up.');
      if (!snap.exists) throw new HttpsError('not-found', 'That top-up request does not exist.');
      const topup = snap.data() || {};
      if (topup.status === 'approved') throw new HttpsError('failed-precondition', 'That top-up has already been completed.');
      if (topup.status !== 'verified') throw new HttpsError('failed-precondition', 'That top-up has not been verified yet.');
      const plan = await creditPlan(tx, db, topup);
      const who = actor(uid, caller);
      tx.update(plan.userRef, { walletBalance: plan.newBalance, walletCurrency: plan.currency, walletBalanceCurrency: plan.currency });
      tx.update(ref, {
        // 'approved' stays the terminal status: ReportsScreen totals filter
        // on it, and renaming it would silently drop every past top-up from
        // the reports.
        status: 'approved',
        completedBy: who.uid, completedByName: who.name, completedByRole: who.role,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: who.uid, approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        creditedAmount: plan.points, creditedCurrency: plan.currency, creditedPoints: plan.points,
      });
      return { userId: plan.userId, points: plan.points, role: who.role, verifiedBy: topup.verifiedBy || null };
    });
    await logAudit({ action: 'topup_completed', targetUid: out.userId, performedBy: uid, performedByRole: out.role, details: { topupId, points: out.points, verifiedBy: out.verifiedBy } });
    return { completed: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('completeTopup', error, { userId: uid, topupId });
    throw new HttpsError('internal', 'Could not complete that top-up.');
  }
});

// ---- both steps at once, superadmin only ----
// Kept so a superadmin is never blocked, and so an app that has not picked
// up the two-step flow yet still works. Records the same superadmin as both
// the verifier and the completer rather than pretending two people looked.
exports.approveTopup = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const uid = requireAdmin(request);
  const db = admin.firestore();
  const topupId = String(request.data?.topupId || request.data?.id || '').trim();
  if (!topupId) throw new HttpsError('invalid-argument', 'topupId is required.');
  const ref = db.collection('topups').doc(topupId);
  try {
    const out = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const caller = await callerInTx(tx, db, uid, request);
      if (caller.role !== 'superadmin') throw new HttpsError('permission-denied', 'A top-up is verified by finance and completed by an admin.');
      if (!snap.exists) throw new HttpsError('not-found', 'That top-up request does not exist.');
      const topup = snap.data() || {};
      if (topup.status !== 'pending' && topup.status !== 'verified') throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      const plan = await creditPlan(tx, db, topup);
      const who = actor(uid, caller);
      const stamp = admin.firestore.FieldValue.serverTimestamp();
      tx.update(plan.userRef, { walletBalance: plan.newBalance, walletCurrency: plan.currency, walletBalanceCurrency: plan.currency });
      tx.update(ref, {
        status: 'approved',
        verifiedBy: topup.verifiedBy || who.uid,
        verifiedByName: topup.verifiedByName || who.name,
        verifiedByRole: topup.verifiedByRole || who.role,
        verifiedAt: topup.verifiedAt || stamp,
        completedBy: who.uid, completedByName: who.name, completedByRole: who.role, completedAt: stamp,
        approvedBy: who.uid, approvedAt: stamp, updatedAt: stamp,
        creditedAmount: plan.points, creditedCurrency: plan.currency, creditedPoints: plan.points,
      });
      return { userId: plan.userId, points: plan.points, role: who.role };
    });
    await logAudit({ action: 'topup_completed', targetUid: out.userId, performedBy: uid, performedByRole: out.role, details: { topupId, points: out.points, oneStep: true } });
    return { approved: true, completed: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('approveTopup', error, { userId: uid, topupId });
    throw new HttpsError('internal', 'Could not complete that top-up.');
  }
});

exports.rejectTopup = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async request => {
  const uid = requireAdmin(request);
  const db = admin.firestore();
  const callerSnap = await db.collection('users').doc(uid).get();
  const caller = callerSnap.exists ? callerSnap.data() : null;
  if (!caller || !activeAccount(caller) || !ADMIN_ROLES.includes(caller.role)) throw new HttpsError('permission-denied', 'Your account cannot reject top-ups.');
  requireSessionMatch(request, caller);
  const topupId = String(request.data?.topupId || '').trim();
  const reason = String(request.data?.reason || '').trim().slice(0, 500);
  if (!topupId) throw new HttpsError('invalid-argument', 'topupId is required.');
  const ref = db.collection('topups').doc(topupId);
  try {
    let targetUid = null;
    await db.runTransaction(async tx => {
      const [snap, callerTxSnap] = await Promise.all([tx.get(ref), tx.get(db.collection('users').doc(uid))]);
      if (!callerTxSnap.exists || !activeAccount(callerTxSnap.data())) throw new HttpsError('permission-denied', 'Your account is not active.');
      const callerTx = callerTxSnap.data() || {};
      if (!ADMIN_ROLES.includes(callerTx.role)) throw new HttpsError('permission-denied', 'Your account cannot reject top-ups.');
      requireSessionMatch(request, callerTx);
      if (!snap.exists) throw new HttpsError('not-found', 'That top-up request does not exist.');
      const topup = snap.data() || {};
      // Rejectable at either stage: an admin completing a verified request can
      // still be the one who spots that the payment is wrong.
      if (topup.status !== 'pending' && topup.status !== 'verified') throw new HttpsError('failed-precondition', 'That request has already been reviewed.');
      targetUid = String(topup.userId || '').trim() || null;
      tx.update(ref, { status: 'rejected', rejectReason: reason || 'Rejected by admin.', rejectedBy: uid, rejectedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    await logAudit({ action: 'topup_rejected', targetUid, performedBy: uid, performedByRole: caller.role, details: { topupId, reason } });
    return { rejected: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('rejectTopup', error, { userId: uid, topupId });
    throw new HttpsError('internal', 'Could not reject this top-up.');
  }
});
