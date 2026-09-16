const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const MAX_AMOUNT = 100000;

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

exports.submitTopupRequest = onCall(async request => {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const data = request.data || {};
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new HttpsError('invalid-argument', 'Enter a valid top-up amount.');
  }
  const method = String(data.method || 'transfer').trim().slice(0, 40);
  const bankName = String(data.bankName || '').trim().slice(0, 120);
  const refNo = String(data.refNo || '').trim().slice(0, 120);
  const receiptUrl = String(data.receiptUrl || '').trim().slice(0, 2048);
  if (!receiptUrl) throw new HttpsError('invalid-argument', 'A payment receipt is required.');

  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'User account not found.');
  const user = userSnap.data();
  const ref = db.collection('topups').doc();
  await ref.set({
    userId: uid,
    userPhone: String(user.phone || '').slice(0, 40),
    userName: String(user.name || '').slice(0, 160),
    userRole: ['customer', 'dealer', 'reseller'].includes(user.role) ? user.role : 'customer',
    amount: Math.round(amount * 100) / 100,
    points: Math.round(amount * 100) / 100,
    method,
    bankName,
    refNo,
    receiptUrl,
    status: 'pending',
    rejectReason: '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});
