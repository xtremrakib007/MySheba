const functions = require('./index');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const crypto = require('crypto');
const admin = require('firebase-admin');
const guards = require('./chargeGuards');
const secureTransfer = require('./secureTransfer');
const secureWalletTransfer = require('./secureWalletTransfer');
const secureWalletMutations = require('./secureWalletMutations');
const secureWalletCharge = require('./secureWalletCharge');
const secureTopupReview = require('./secureTopupReview');
const rejectionService = require('./rejectionService');
const transactionService = require('./transactionService');
const salaryMutationService = require('./salaryMutationService');

functions.chargeRecharge = guards.chargeRecharge;
functions.chargeInternetPackage = guards.chargeInternetPackage;
functions.chargeMobileBanking = guards.chargeMobileBanking;
functions.chargeRemittance = guards.chargeRemittance;
functions.chargeWallet = secureWalletCharge.chargeWallet;
functions.transferPoints = secureTransfer.transferPoints;
functions.walletTransfer = secureWalletTransfer.walletTransfer;
functions.createSelfTopup = secureWalletMutations.createSelfTopup;
functions.approveTopup = secureTopupReview.approveTopup;
functions.rejectTopup = secureTopupReview.rejectTopup;
functions.rejectTransaction = rejectionService.rejectTransaction;
functions.assignDealer = transactionService.assignDealer;
functions.scrubCompletedTransactionPins = transactionService.scrubCompletedTransactionPins;

// The base device-session callable historically checked the staff email OTP
// without incrementing attempts on failed codes. Production wraps it here so
// failed guesses are consumed atomically before the underlying verification
// handler can accept a code.
const baseCheckDeviceSession = functions.checkDeviceSession;
const STAFF_ROLES = new Set(['admin', 'superadmin', 'dealer', 'reseller']);
const EMAIL_OTP_MAX_ATTEMPTS = 5;
const hashOtp = (value) => crypto.createHash('sha256').update(String(value || '').trim()).digest('hex');

functions.checkDeviceSession = onCall({ enforceAppCheck: true }, async (request) => {
  const data = request.data || {};
  const uid = request.auth?.uid;
  const emailOtp = String(data.emailOtp || '').trim();
  if (uid && emailOtp) {
    const db = admin.firestore();
    const ref = db.collection('users').doc(uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'No profile found for this account.');
      const profile = snap.data() || {};
      if (!STAFF_ROLES.has(profile.role)) return;
      const challenge = profile.pendingAdminEmailChallenge;
      if (!challenge) throw new HttpsError('failed-precondition', 'No active verification challenge. Please request a new email.');
      if (challenge.deviceId !== String(data.deviceId || '').trim()) throw new HttpsError('failed-precondition', 'No active verification challenge. Please request a new email.');
      if (String(challenge.email || '').trim().toLowerCase() !== String(profile.email || '').trim().toLowerCase()) throw new HttpsError('failed-precondition', 'The verification email does not match this account.');
      if (!challenge.expiresAt?.toMillis || challenge.expiresAt.toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'That verification code expired.');
      const attempts = Number(challenge.attempts || 0);
      if (attempts >= EMAIL_OTP_MAX_ATTEMPTS) throw new HttpsError('resource-exhausted', 'Too many attempts. Request a new verification email.');
      const valid = /^\d{6}$/.test(emailOtp) && hashOtp(emailOtp) === challenge.codeHash;
      if (!valid) {
        tx.update(ref, { 'pendingAdminEmailChallenge.attempts': admin.firestore.FieldValue.increment(1) });
        throw new HttpsError('invalid-argument', 'Incorrect verification code.');
      }
    });
  }
  return baseCheckDeviceSession.run(request);
});

// Salary & OT mutations are server-owned. secureIndexV2 is the production
// functions entrypoint, so these must be attached here (not only exported
// from an unused helper module).
functions.saveSalarySettings = salaryMutationService.saveSalarySettings;
functions.addAllowance = salaryMutationService.addAllowance;
functions.updateAllowance = salaryMutationService.updateAllowance;
functions.deleteAllowance = salaryMutationService.deleteAllowance;
functions.addDeduction = salaryMutationService.addDeduction;
functions.updateDeduction = salaryMutationService.updateDeduction;
functions.deleteDeduction = salaryMutationService.deleteDeduction;
functions.saveSalaryEstimate = salaryMutationService.saveSalaryEstimate;
functions.recordActualSalary = salaryMutationService.recordActualSalary;
functions.attachSalaryPayslip = salaryMutationService.attachSalaryPayslip;
functions.deleteSalaryRecord = salaryMutationService.deleteSalaryRecord;

module.exports = functions;
