'use strict';
/**
 * Funding a staff wallet from the one above it.
 *
 * Money reaches a customer by moving, not by appearing: finance pays the
 * customer, admin pays finance, superadmin pays admin. Every hop is a real
 * transfer with a real balance behind it, so nobody - superadmin included -
 * can send what they do not hold. That is what keeps the total in circulation
 * tied to something.
 *
 * A request is raised when the payer is short. It does not cancel the customer
 * top-up that prompted it: that stays pending and visible, and is approved
 * once the funds arrive. The customer waits; they never resubmit.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { inferWalletCurrency, money } = require('./walletCurrencyService');
const { logAudit, logServerError } = require('./logService');

const COLLECTION = 'walletFundingRequests';
const MAX_AMOUNT = 1000000;
const MONEY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;

// Who funds whom. Superadmin is the top: it has nobody to ask, which is why
// its own balance has to come from somewhere real rather than from here.
const FUNDS_FROM = { finance: 'admin', admin: 'superadmin' };

function activeAccount(a) {
  return !!a && a.mergedInto == null && a.suspended !== true && a.inactive !== true
    && a.disabled !== true && a.active !== false;
}

function requireSessionMatch(request, account) {
  const sessionId = request.data?.sessionId;
  const deviceId = request.data?.deviceId;
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)
      || typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    throw new HttpsError('failed-precondition', 'Your secure session is missing. Please sign in again.');
  }
  if (account.activeSessionId !== sessionId || account.activeDeviceId !== deviceId) {
    throw new HttpsError('permission-denied', 'This device session is no longer active. Please sign in again.');
  }
}

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

/** An amount that is a real sum of money, written the way money is written. */
function validAmount(value) {
  const raw = typeof value === 'number' ? String(value) : String(value || '').trim();
  if (!MONEY_RE.test(raw)) throw new HttpsError('invalid-argument', 'Enter a valid amount.');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) throw new HttpsError('invalid-argument', 'Enter a valid amount.');
  return n;
}

function balanceOf(account, currency) {
  const n = Number(account?.walletBalance || 0);
  if (!Number.isFinite(n) || n < 0) throw new HttpsError('failed-precondition', 'Wallet balance is invalid.');
  return money(n, currency);
}

exports.requestWalletFunding = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const amount = validAmount(request.data?.amount);
  const note = String(request.data?.note || '').trim().slice(0, 500);

  const snap = await db.collection('users').doc(uid).get();
  const me = snap.exists ? (snap.data() || {}) : null;
  if (!me || !activeAccount(me)) throw new HttpsError('permission-denied', 'Your account is not active.');
  requireSessionMatch(request, me);
  const approverRole = FUNDS_FROM[me.role];
  if (!approverRole) throw new HttpsError('permission-denied', 'Only finance and admin can request wallet funding.');

  // One open request at a time. Two pending requests for the same wallet are
  // approved separately and transfer twice, for a shortfall that existed once.
  const open = await db.collection(COLLECTION)
    .where('fromUid', '==', uid).where('status', '==', 'pending').limit(1).get();
  if (!open.empty) throw new HttpsError('failed-precondition', 'You already have a funding request waiting for a decision.');

  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    fromUid: uid,
    fromName: me.name || me.displayName || '',
    fromRole: me.role,
    approverRole,
    amount,
    currency: inferWalletCurrency(me),
    note,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await logAudit({ action: 'wallet_funding_requested', targetUid: uid, performedBy: uid, performedByRole: me.role, details: { amount, approverRole } });
  return { id: ref.id, approverRole };
});

exports.listWalletFundingRequests = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const snap = await db.collection('users').doc(uid).get();
  const me = snap.exists ? (snap.data() || {}) : null;
  if (!me || !activeAccount(me)) throw new HttpsError('permission-denied', 'Your account is not active.');

  const row = (d) => {
    const x = d.data() || {};
    return {
      id: d.id,
      fromUid: x.fromUid, fromName: x.fromName || '', fromRole: x.fromRole || '',
      approverRole: x.approverRole || '', amount: Number(x.amount || 0), currency: x.currency || 'MYR',
      note: String(x.note || ''), status: x.status || 'pending',
      rejectReason: String(x.rejectReason || ''),
      createdAt: x.createdAt?.toMillis ? x.createdAt.toMillis() : null,
      decidedAt: x.decidedAt?.toMillis ? x.decidedAt.toMillis() : null,
    };
  };

  // What this person must decide, and what they are waiting on. A requester
  // seeing their own request is how they know it was not lost.
  const [incoming, outgoing] = await Promise.all([
    FUNDS_FROM[me.role] === undefined && !['admin', 'superadmin'].includes(me.role)
      ? Promise.resolve({ docs: [] })
      : db.collection(COLLECTION).where('approverRole', '==', me.role).where('status', '==', 'pending').limit(100).get(),
    db.collection(COLLECTION).where('fromUid', '==', uid).limit(50).get(),
  ]);
  return { incoming: incoming.docs.map(row), outgoing: outgoing.docs.map(row) };
});

exports.decideWalletFunding = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const id = String(request.data?.requestId || '').trim();
  if (!id) throw new HttpsError('invalid-argument', 'requestId is required.');
  const approve = request.data?.approve === true;
  const reason = String(request.data?.reason || '').trim().slice(0, 500);
  const ref = db.collection(COLLECTION).doc(id);

  try {
    const out = await db.runTransaction(async (tx) => {
      // Every read first: Firestore refuses a read after a write, and that
      // failure reaches the app as a bare INTERNAL naming nothing.
      const [reqSnap, approverSnap] = await Promise.all([tx.get(ref), tx.get(db.collection('users').doc(uid))]);
      if (!reqSnap.exists) throw new HttpsError('not-found', 'That funding request no longer exists.');
      const fundingRequest = reqSnap.data() || {};
      const approver = approverSnap.exists ? (approverSnap.data() || {}) : null;
      if (!approver || !activeAccount(approver)) throw new HttpsError('permission-denied', 'Your account is not active.');
      requireSessionMatch(request, approver);
      if (fundingRequest.approverRole !== approver.role) {
        throw new HttpsError('permission-denied', 'This funding request is not yours to decide.');
      }
      if (fundingRequest.status !== 'pending') throw new HttpsError('failed-precondition', 'That request has already been decided.');

      const requesterRef = db.collection('users').doc(String(fundingRequest.fromUid || ''));
      const requesterSnap = await tx.get(requesterRef);
      if (!requesterSnap.exists) throw new HttpsError('not-found', 'That account no longer exists.');
      const requester = requesterSnap.data() || {};
      if (!activeAccount(requester)) throw new HttpsError('failed-precondition', 'That account is not active.');

      const stamp = admin.firestore.FieldValue.serverTimestamp();
      if (!approve) {
        tx.update(ref, { status: 'rejected', rejectReason: reason, decidedBy: uid, decidedAt: stamp, updatedAt: stamp });
        return { approved: false, amount: Number(fundingRequest.amount || 0), toUid: requesterRef.id };
      }

      // Both wallets in one currency, or the sum transferred is not the sum
      // received and the difference is invented by whoever converts it.
      const currency = inferWalletCurrency(approver);
      if (inferWalletCurrency(requester) !== currency) {
        throw new HttpsError('failed-precondition', 'Both wallets must use the same currency for a transfer.');
      }
      const amount = money(Number(fundingRequest.amount || 0), currency);
      const approverBalance = balanceOf(approver, currency);
      const requesterBalance = balanceOf(requester, currency);
      if (approverBalance < amount) {
        // The whole point of the chain: ask the level above instead.
        throw new HttpsError('failed-precondition',
          `Your wallet holds ${approverBalance.toFixed(2)} ${currency}, less than the ${amount.toFixed(2)} ${currency} requested. Request funding from your own approver first.`);
      }

      tx.update(approverSnap.ref, { walletBalance: money(approverBalance - amount, currency), walletCurrency: currency });
      tx.update(requesterRef, { walletBalance: money(requesterBalance + amount, currency), walletCurrency: currency });
      tx.update(ref, { status: 'approved', decidedBy: uid, decidedByRole: approver.role, decidedAt: stamp, updatedAt: stamp, transferredAmount: amount, transferredCurrency: currency });
      return { approved: true, amount, toUid: requesterRef.id, currency };
    });

    await logAudit({
      action: out.approved ? 'wallet_funding_approved' : 'wallet_funding_rejected',
      targetUid: out.toUid, performedBy: uid, details: { requestId: id, amount: out.amount },
    });
    return out;
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('decideWalletFunding', error, { userId: uid, requestId: id });
    throw new HttpsError('internal', 'Could not decide that funding request.');
  }
});

exports._test = { FUNDS_FROM, validAmount, activeAccount };
