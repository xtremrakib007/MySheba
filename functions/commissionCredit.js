const admin = require('firebase-admin');
const { addWalletLedgerEntry } = require('./walletLedgerService');
const { addCommissionLedgerEntry } = require('./commissionService');

// The commission an order recorded at purchase (commissionAmount, status
// 'pending'), paid when the order completes. A provider that answers
// "processing" completes the order later - on its callback, or when finance
// reconciles it - and those paths used to mark the order completed without
// ever paying it, so most orders never earned their commission.
//
// Inside a Firestore transaction reads must come before writes, hence two
// steps: readCommissionPayee (a read) before any write, then
// payPendingCommission (writes) with what it returned.

function pendingCommission(order) {
  const amount = Math.round(Number(order?.commissionAmount || 0) * 100) / 100;
  const uid = String(order?.customerId || '');
  if (order?.commissionStatus !== 'pending' || !(amount > 0) || !uid) return null;
  return { amount, uid };
}

async function readCommissionPayee(tx, db, order) {
  const due = pendingCommission(order);
  if (!due) return null;
  const userRef = db.collection('users').doc(due.uid);
  const userSnap = await tx.get(userRef);
  return userSnap.exists ? { ...due, userRef, userSnap } : null;
}

/** Credits the wallet and both ledgers; returns the fields to merge into the order update ({} when nothing was due). */
function payPendingCommission(tx, db, txRef, order, payee, { service } = {}) {
  if (!payee) return {};
  const before = Number(payee.userSnap.data()?.walletBalance || 0);
  if (!Number.isFinite(before) || before < 0) return {};
  const after = Math.round((before + payee.amount) * 100) / 100;
  const currency = order.walletCurrency || order.currency || 'MYR';
  const label = service || order.service || '';
  tx.update(payee.userRef, { walletBalance: after });
  addWalletLedgerEntry(tx, db, {
    uid: payee.uid, direction: 'credit', type: 'service_commission', currency, amount: payee.amount,
    balanceBefore: before, balanceAfter: after, relatedTransactionId: txRef.id, idempotencyKey: txRef.id + ':commission',
    source: 'service_commission', createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  addCommissionLedgerEntry(tx, db, {
    uid: payee.uid, role: order.customerRole, service: label, amount: payee.amount, currency,
    transactionId: txRef.id, balanceBefore: before, balanceAfter: after,
  });
  return { commissionStatus: 'earned', commissionEarnedAt: admin.firestore.FieldValue.serverTimestamp() };
}

module.exports = { pendingCommission, readCommissionPayee, payPendingCommission };
