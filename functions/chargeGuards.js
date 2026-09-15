const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const walletService = require('./walletService');

function requireAuth(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  return request.auth.uid;
}

async function sanitizeRequest(request) {
  const uid = requireAuth(request);
  const db = admin.firestore();
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Account not found.');
  const profile = snap.data() || {};

  // Never trust customer identity, phone, dealer/reseller scope, or role
  // supplied by the client. The wallet callable must always charge the
  // authenticated account and create the transaction under that account.
  const customer = {
    uid,
    phone: profile.phone || '',
    resellerId: profile.resellerId || null,
    dealerId: profile.dealerId || null,
    role: profile.role || '',
  };

  return {
    ...request,
    data: {
      ...(request.data || {}),
      customer,
    },
  };
}

function wrap(name) {
  return onCall(async (request) => {
    const safeRequest = await sanitizeRequest(request);
    const fn = walletService[name];
    if (!fn || typeof fn.run !== 'function') {
      throw new HttpsError('internal', 'Charge service is unavailable.');
    }
    return fn.run(safeRequest);
  });
}

exports.chargeRecharge = wrap('chargeRecharge');
exports.chargeInternetPackage = wrap('chargeInternetPackage');
exports.chargeMobileBanking = wrap('chargeMobileBanking');
exports.chargeRemittance = wrap('chargeRemittance');
