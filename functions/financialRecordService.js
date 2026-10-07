const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { logAudit } = require('./logService');

const MAX_REASON = 1000;

async function superadminActor(db, request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;
  const snap = await db.collection('users').doc(uid).get();
  const profile = snap.exists ? snap.data() : null;
  if (!profile || profile.suspended === true || profile.inactive === true ||
      profile.disabled === true || profile.active === false || profile.mergedInto) {
    throw new HttpsError('permission-denied', 'Your account is not active.');
  }
  if (String(profile.role || '') !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Only Superadmin can manage financial records.');
  }
  return { uid, name: String(profile.name || profile.displayName || profile.email || '').trim().slice(0, 200), role: 'superadmin' };
}

function recordId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new HttpsError('invalid-argument', 'A valid record id is required.');
  return id;
}

function reason(value) {
  const text = String(value || '').trim().slice(0, MAX_REASON);
  if (!text) throw new HttpsError('invalid-argument', 'A reason is required.');
  return text;
}

/**
 * "Delete" in the admin UI is a protected financial archive, never a physical
 * Firestore delete. This keeps the accounting/audit chain intact while removing
 * the record from normal operational use.
 */
exports.archiveFinancialRecord = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const db = admin.firestore();
  const actor = await superadminActor(db, request);
  const type = String(request.data?.recordType || '').trim();
  const id = recordId(request.data?.recordId);
  const note = reason(request.data?.reason);

  if (!['transaction', 'invoice'].includes(type)) {
    throw new HttpsError('invalid-argument', 'Unsupported financial record type.');
  }

  const collection = type === 'transaction' ? 'transactions' : 'invoices';
  const ref = db.collection(collection).doc(id);

  const before = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That financial record no longer exists.');
    const data = snap.data() || {};
    if (data.deletedAt || data.archivedAt) {
      throw new HttpsError('failed-precondition', 'That record is already archived.');
    }

    const update = {
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      archivedBy: actor.uid,
      archivedByName: actor.name,
      archivedByRole: actor.role,
      archiveReason: note,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (type === 'invoice') {
      // Keep the original invoice number and accounting evidence. Cancel rather
      // than physically delete the issued document.
      update.status = 'cancelled';
      update.deletedAt = admin.firestore.FieldValue.serverTimestamp();
      update.deletedBy = actor.uid;
      update.deletedByName = actor.name;
      update.deletedByRole = actor.role;
      update.deleteReason = note;
    } else {
      // Never rewrite the original transaction status. A separate financial
      // state makes it impossible to mistake an archived order for a failed one.
      update.financialState = 'archived';
    }

    tx.update(ref, update);
    return data;
  });

  await logAudit({
    action: type === 'invoice' ? 'invoice_archived' : 'transaction_archived',
    targetUid: String(before.customerId || before.createdBy || ''),
    performedBy: actor.uid,
    performedByRole: actor.role,
    details: {
      recordType: type,
      recordId: id,
      previousStatus: String(before.status || ''),
      amount: Number(before.total ?? before.amount ?? 0),
      currency: String(before.currency || before.walletCurrency || 'MYR'),
      reason: note,
    },
  });

  return { id, recordType: type, status: type === 'invoice' ? 'cancelled' : 'archived' };
});
