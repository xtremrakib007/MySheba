const admin = require('firebase-admin');

const QUALIFYING = new Set(['Recharge','Internet','Bill Payment','Mobile Banking','Remittance']);

async function createPending(db, id, data) {
  const ref = db.collection('growthRewardLedger').doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return;
    tx.create(ref, { ...data, status: 'pending', createdAt: admin.firestore.FieldValue.serverTimestamp() });
  });
}

exports.handleCompletedTransaction = async (transactionId, tx) => {
  if (!tx || tx.status !== 'completed' || !QUALIFYING.has(String(tx.service || ''))) return;
  const uid = String(tx.customerId || '').trim();
  if (!uid) return;
  const db = admin.firestore();
  const settingsSnap = await db.collection('settings').doc('growth').get();
  const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
  if (settings.referralEnabled === false && !Number(settings.firstTransactionReward) && !Number(settings.welcomeReward)) return;

  const customerRef = db.collection('users').doc(uid);
  const customerSnap = await customerRef.get();
  if (!customerSnap.exists) return;
  const customer = customerSnap.data() || {};
  if (customer.role !== 'customer' || customer.active === false || customer.disabled === true || customer.suspended === true || customer.inactive === true || customer.mergedInto) return;

  const minimum = Math.max(0, Number(settings.minimumTransaction) || 0);
  const charged = Number(tx.total ?? tx.amount ?? tx.pointsCharged ?? 0);
  if (!Number.isFinite(charged) || charged < minimum) return;

  const previous = await db.collection('transactions').where('customerId','==',uid).where('status','==','completed').limit(100).get();
  const ordered = previous.docs.slice().sort((x, y) => { const a=x.data()?.completedAt?.toMillis?.() || x.data()?.createdAt?.toMillis?.() || 0; const b=y.data()?.completedAt?.toMillis?.() || y.data()?.createdAt?.toMillis?.() || 0; return a-b; });
  const isFirst = ordered.length > 0 && ordered[0].id === transactionId;

  if (isFirst) {
    const firstReward = Math.max(0, Number(settings.firstTransactionReward) || 0);
    const welcomeReward = Math.max(0, Number(settings.welcomeReward) || 0);
    if (firstReward > 0) {
      await createPending(db, `first_${uid}`, {
        uid, kind: 'first_transaction', amount: firstReward, currency: 'MYR',
        sourceTransactionId: transactionId, reason: 'First qualifying transaction',
      });
    }
    if (welcomeReward > 0) {
      await createPending(db, `welcome_${uid}`, {
        uid, kind: 'welcome', amount: welcomeReward, currency: 'MYR',
        sourceTransactionId: transactionId, reason: 'New customer welcome reward',
      });
    }
    const referral = customer.referral || {};
    const referrerUid = String(referral.referredBy || '').trim();
    const referralReward = Math.max(0, Number(settings.referralReward) || 0);
    if (settings.referralEnabled !== false && referrerUid && referral.status !== 'qualified') {
      // Create the idempotent reward record first. If the trigger retries after
      // a transient write failure, an already-created ledger entry is harmless;
      // the referral status can then still be marked qualified.
      if (referralReward > 0) {
        await createPending(db, `referral_${uid}`, {
          uid: referrerUid, referredUid: uid, kind: 'referral', amount: referralReward, currency: 'MYR',
          sourceTransactionId: transactionId, reason: 'Referred customer completed first qualifying transaction',
        });
      }
      await db.runTransaction(async (t) => {
        const live = await t.get(customerRef);
        const liveReferral = live.exists ? (live.data()?.referral || {}) : {};
        if (liveReferral.status === 'qualified') return;
        t.update(customerRef, { referral: { ...liveReferral, status: 'qualified', qualifiedAt: admin.firestore.FieldValue.serverTimestamp(), qualifyingTransactionId: transactionId } });
      });
    }
  }
};
