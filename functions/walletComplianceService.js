/**
 * MySheba Malaysia wallet compliance guardrails.
 *
 * This module is deliberately fail-closed for public funding. A licensed/
 * authorised wallet partner and legal/compliance approval must be configured
 * before customer deposits can be accepted.
 */
const { HttpsError } = require('firebase-functions/v2/https');

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
  publicFundingDefaultEnabled: false,
});

function assertNoCashOut(operation) {
  const value = String(operation || '').trim().toLowerCase();
  if (['cashout', 'cash_out', 'withdrawal', 'bank_withdrawal', 'external_wallet_transfer'].includes(value)) {
    throw new HttpsError(
      'failed-precondition',
      'Cash withdrawal and external wallet withdrawals are not available in the MySheba wallet model.'
    );
  }
}

function isKycApproved(profile) {
  return profile?.verified === true || profile?.verificationStatus === 'approved';
}

function assertCustomerP2PEligible(profile, label = 'wallet') {
  if (!profile || profile.role !== 'customer') {
    throw new HttpsError('permission-denied', label + ' is not eligible for customer wallet transfers.');
  }
  if (!isKycApproved(profile)) {
    throw new HttpsError('failed-precondition', 'Complete KYC before using ' + label + ' transfers.');
  }
}

async function getFundingPolicy(db) {
  const snap = await db.collection('settings').doc('walletCompliance').get();
  const data = snap.exists ? (snap.data() || {}) : {};
  return {
    policyVersion: POLICY_VERSION,
    partnerConfigured: data.partnerConfigured === true,
    publicFundingEnabled: data.publicFundingEnabled === true,
    p2pEnabled: data.p2pEnabled !== false,
    noCashOut: true,
  };
}

async function assertPublicFundingEnabled(db) {
  const policy = await getFundingPolicy(db);
  if (!policy.partnerConfigured || !policy.publicFundingEnabled) {
    throw new HttpsError(
      'failed-precondition',
      'Wallet funding is not enabled for public use. Complete the approved Malaysian wallet-partner setup first.'
    );
  }
  return policy;
}

module.exports = {
  POLICY_VERSION,
  POLICY,
  assertNoCashOut,
  isKycApproved,
  assertCustomerP2PEligible,
  getFundingPolicy,
  assertPublicFundingEnabled,
};
