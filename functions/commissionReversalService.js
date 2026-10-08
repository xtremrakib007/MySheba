const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { addWalletLedgerEntry } = require('./walletLedgerService');
const { logAudit } = require('./logService');

function requireSuperadmin(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const profile = request.data?._serverProfile;
  return request.auth.uid;
}

exports.reverseCommission = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const uid = request.auth.uid;
  const profileSnap = await db.collection('users').doc(uid).get();
  const profile = profileSnap.data() || {};
  if (profile.role !== 'superadmin' || profile.suspended === true || profile.disabled === true || profile.inactive === true) {
    throw new HttpsError('permission-denied', 'Superadmin access is required.');
  }

  const transactionId = String(request.data?.transactionId || '').trim();
  const reason = String(request.data?.reason || '').trim().slice(0, 500);
  if (!transactionId || !reason) throw new HttpsError('invalid-argument', 'Transaction ID and reversal reason are required.');

  const txRef = db.collection('transactions').doc(transactionId);
  let result;
  await db.runTransaction(async tx => {
    const snap = await tx.get(txRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Transaction not found.');
    const t = snap.data() || {};
    if (t.commissionStatus !== 'earned') {
      throw new HttpsError('failed-precondition', 'Only earned commissions can be reversed.');
    }
    const amount = Number(t.commissionAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpsError('failed-precondition', 'Transaction has no reversible commission.');

    const userRef = db.collection('users').doc(t.customerId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError('not-found', 'Commission owner not found.');
    const user = userSnap.data() || {};
    const before = Number(user.walletBalance || 0);
    if (!Number.isFinite(before) || before < amount) {
      throw new HttpsError('failed-precondition', 'The commission balance is insufficient for reversal.');
    }
    const after = Math.round((before - amount) * 100) / 100;

    tx.update(userRef, { walletBalance: after });
    addWalletLedgerEntry(tx, db, {
      uid: t.customerId,
      direction: 'debit',
      type: 'commission_reversal',
      currency: t.currency || 'MYR',
      amount,
      balanceBefore: before,
      balanceAfter: after,
      relatedTransactionId: transactionId,
      idempotencyKey: transactionId + ':commission-reversal',
      source: 'commission_reversal',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.create(db.collection('commissionLedger').doc(), {
      userId: t.customerId,
      role: t.customerRole || 'customer',
      service: t.service || '',
      amount: -amount,
      currency: t.currency || 'MYR',
      transactionId,
      status: 'reversed',
      reversalOf: transactionId,
      reason,
      performedBy: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(txRef, {
      commissionStatus: 'reversed',
      commissionReversedAt: admin.firestore.FieldValue.serverTimestamp(),
      commissionReversedBy: uid,
      commissionReversalReason: reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    result = { transactionId, reversedAmount: amount, balanceAfter: after };
  });

  await logAudit({
    action: 'commission_reversed',
    targetUid: result.transactionId,
    performedBy: uid,
    performedByRole: 'superadmin',
    details: result,
  });
  return result;
});
