/**
 * MySheba Malaysia wallet compliance guardrails.
 *
 * Policy-only: the wallet/funds model must be approved with the relevant
 * Malaysian licensed partner and legal/compliance adviser before public
 * funding is enabled.
 */
const POLICY_VERSION = 'MY-LAUNCH-WALLET-COMPLIANCE-1.0';

const POLICY = Object.freeze({
  version: POLICY_VERSION,
  currency: 'MYR',
  cashWithdrawal: false,
  bankWithdrawal: false,
  cryptoConversion: false,
  externalWalletTransfer: false,
  gamblingWallet: false,
  clientSideBalanceMutation: false,
  receiptAloneCreditsFunds: false,
  customerP2PRequiresKyc: true,
  financialMutationsServerOnly: true,
  immutableLedger: true,
  partnerRequiredForRegulatedFunding: true,
});

function assertNoCashOut(operation) {
  const value = String(operation || '').trim().toLowerCase();
  if (['cashout', 'cash_out', 'withdrawal', 'bank_withdrawal', 'external_wallet_transfer'].includes(value)) {
    const { HttpsError } = require('firebase-functions/v2/https');
    throw new HttpsError('failed-precondition', 'Cash withdrawal and external wallet withdrawals are not available in the MySheba wallet model.');
  }
}

function isKycApproved(profile) {
  return profile?.verified === true || profile?.verificationStatus === 'approved';
}

function assertCustomerP2PEligible(profile, label = 'wallet') {
  const { HttpsError } = require('firebase-functions/v2/https');
  if (!profile || profile.role !== 'customer') {
    throw new HttpsError('permission-denied', label + ' is not eligible for customer wallet transfers.');
  }
  if (!isKycApproved(profile)) {
    throw new HttpsError('failed-precondition', 'Complete KYC before using ' + label + ' transfers.');
  }
}

module.exports = {
  POLICY_VERSION,
  POLICY,
  assertNoCashOut,
  isKycApproved,
  assertCustomerP2PEligible,
};
