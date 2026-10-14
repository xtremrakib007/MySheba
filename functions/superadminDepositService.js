'use strict';
/**
 * Where money enters MySheba: the superadmin records a real bank deposit.
 *
 * Every other credit is a transfer - superadmin funds admin, admin funds
 * finance, finance pays the customer (walletFundingService.js,
 * secureTopupReview.js) - so the superadmin's balance is the one place value
 * comes into the system. Until now nothing could put it there except editing
 * Firestore by hand, and the superadmin's Add Money button did nothing.
 *
 * This is not the old self top-up (createSelfTopup, still disabled), which
 * any admin could use with nothing behind it. A deposit:
 *   - is superadmin only, from the signed-in device session, with a sign-in
 *     from the last 15 minutes (the PIN prompt in the app);
 *   - names the bank and the bank's own reference, and carries a receipt
 *     image the caller uploaded - each reference can be recorded once;
 *   - is capped per deposit and rate limited;
 *   - is idempotent on requestId, so a retried tap credits once;
 *   - writes the balance, an immutable walletLedger entry, the deposit record
 *     (selfTopups, which History already shows) and an audit log entry.
 * So every ringgit in circulation can be matched to a line on a bank
 * statement.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');
const { assertWalletUnfrozen } = require('./walletFreeze');
const { inferWalletCurrency, money } = require('./walletCurrencyService');
const { addWalletLedgerEntry } = require('./walletLedgerService');
const { logAudit, logServerError } = require('./logService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { sessionMatches } = require('./sessionSlots');
const { validateReceiptUrl } = require('./topupSubmissionService');

const MAX_DEPOSIT = 50000;
const RECENT_AUTH_SECONDS = 15 * 60;
const MONEY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const SESSION_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9-]{16,100}$/;

function activeAccount(a) {
  return !!a && a.mergedInto == null && a.suspended !== true && a.inactive !== true
    && a.disabled !== true && a.active !== false;
}

function validAmount(value) {
  const raw = typeof value === 'number' ? String(value) : String(value || '').trim();
  if (!MONEY_RE.test(raw)) throw new HttpsError('invalid-argument', 'Enter a valid amount.');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new HttpsError('invalid-argument', 'Enter a valid amount.');
  if (n > MAX_DEPOSIT) throw new HttpsError('invalid-argument', `One deposit can be at most ${MAX_DEPOSIT.toLocaleString('en-MY')}. Record a larger sum as separate bank deposits.`);
  return n;
}

function requireRecentAuth(request, now = Date.now()) {
  const authTime = Number(request.auth?.token?.auth_time || 0);
  if (!Number.isFinite(authTime) || authTime <= 0 || Math.floor(now / 1000) - authTime > RECENT_AUTH_SECONDS) {
    throw new HttpsError('failed-precondition', 'Recent authentication is required to record a deposit.');
  }
}

/** A bank reference, normalised so "ab 123" and "AB123" are the same deposit. */
function referenceKey(bankName, refNo) {
  const norm = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(`${norm(bankName)}|${norm(refNo)}`).digest('hex').slice(0, 40);
}

function validateInput(data) {
  const amount = validAmount(data?.amount);
  const bankName = String(data?.bankName || '').trim().slice(0, 120);
  const refNo = String(data?.refNo || '').trim().slice(0, 120);
  const note = String(data?.note || '').trim().slice(0, 500);
  const receiptUrl = String(data?.receiptUrl || '').trim().slice(0, 2048);
  const requestId = String(data?.requestId || '');
  if (!bankName) throw new HttpsError('invalid-argument', 'Enter the bank the money was deposited into.');
  if (!/[A-Za-z0-9]{3,}/.test(refNo)) throw new HttpsError('invalid-argument', "Enter the bank's reference number for this deposit.");
  if (!receiptUrl) throw new HttpsError('invalid-argument', 'Attach the bank receipt or statement line.');
  if (!REQUEST_ID_RE.test(requestId)) throw new HttpsError('invalid-argument', 'A valid requestId is required.');
  return { amount, bankName, refNo, note, receiptUrl, requestId };
}

exports.recordSuperadminDeposit = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const input = validateInput(request.data);
  requireRecentAuth(request);

  const userRef = db.collection('users').doc(uid);
  const me = (await userRef.get()).data() || null;
  if (!me || !activeAccount(me)) throw new HttpsError('permission-denied', 'Your account is not active.');
  if (me.role !== 'superadmin') throw new HttpsError('permission-denied', 'Only the superadmin can record a deposit.');
  const sessionId = request.data?.sessionId;
  const deviceId = request.data?.deviceId;
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId) || typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    throw new HttpsError('failed-precondition', 'Your secure session is missing. Please sign in again.');
  }
  if (!sessionMatches(me, { sessionId, deviceId })) throw new HttpsError('permission-denied', 'This device session is no longer active. Please sign in again.');

  const depositRef = db.collection('selfTopups').doc(`deposit_${uid}_${input.requestId}`);
  // A retried tap: answer with the deposit already recorded.
  const prior = await depositRef.get();
  if (prior.exists) return { id: depositRef.id, amount: Number(prior.data()?.amount || 0), duplicate: true };

  await checkVelocity(db, uid, 'recordSuperadminDeposit', { ip: getClientIp(request) });
  await validateReceiptUrl(input.receiptUrl, uid);

  const referenceRef = db.collection('depositReferences').doc(referenceKey(input.bankName, input.refNo));
  try {
    const out = await db.runTransaction(async (tx) => {
      const [userSnap, depositSnap, referenceSnap] = await Promise.all([tx.get(userRef), tx.get(depositRef), tx.get(referenceRef)]);
      if (depositSnap.exists) return { amount: Number(depositSnap.data()?.amount || 0), duplicate: true };
      if (referenceSnap.exists) {
        throw new HttpsError('already-exists', `Bank reference ${input.refNo} at ${input.bankName} is already recorded.`);
      }
      const user = userSnap.data() || null;
      if (!user || !activeAccount(user) || user.role !== 'superadmin') throw new HttpsError('permission-denied', 'Only the superadmin can record a deposit.');
      assertWalletUnfrozen(user, 'Your wallet');
      const currency = inferWalletCurrency(user);
      const amount = money(input.amount, currency);
      const before = Number(user.walletBalance || 0);
      if (!Number.isFinite(before) || before < 0) throw new HttpsError('failed-precondition', 'Wallet balance is invalid.');
      const after = money(before + amount, currency);
      if (!Number.isSafeInteger(Math.round(after * 100))) throw new HttpsError('failed-precondition', 'Wallet balance is too large.');
      const stamp = admin.firestore.FieldValue.serverTimestamp();

      tx.update(userRef, { walletBalance: after, walletCurrency: currency });
      tx.create(referenceRef, { depositId: depositRef.id, uid, bankName: input.bankName, refNo: input.refNo, createdAt: stamp });
      tx.create(depositRef, {
        userId: uid, userName: user.name || '', userPhone: user.phone || '', userRole: 'superadmin',
        kind: 'deposit', method: 'bank_deposit', amount, points: amount, currency,
        bankName: input.bankName, refNo: input.refNo, receiptUrl: input.receiptUrl, note: input.note,
        balanceBefore: before, balanceAfter: after, status: 'approved', createdAt: stamp, updatedAt: stamp,
      });
      addWalletLedgerEntry(tx, db, {
        uid, type: 'superadmin_deposit', direction: 'credit', currency, amount,
        balanceBefore: before, balanceAfter: after, relatedTransactionId: depositRef.id,
        providerReference: input.refNo, idempotencyKey: depositRef.id, source: 'bank_deposit', createdAt: stamp,
      });
      return { amount, currency, before, after, duplicate: false };
    });
    if (!out.duplicate) {
      await logAudit({
        action: 'superadmin_deposit_recorded', targetUid: uid, performedBy: uid, performedByRole: 'superadmin',
        details: { depositId: depositRef.id, amount: out.amount, currency: out.currency, bankName: input.bankName, refNo: input.refNo, balanceBefore: out.before, balanceAfter: out.after },
      });
    }
    return { id: depositRef.id, amount: out.amount, duplicate: out.duplicate };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    await logServerError('recordSuperadminDeposit', error, { userId: uid });
    throw new HttpsError('internal', 'Could not record this deposit.');
  }
});

exports._test = { validAmount, validateInput, referenceKey, requireRecentAuth, MAX_DEPOSIT };
