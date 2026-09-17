const functions = require('./index');
const guards = require('./chargeGuards');
const secureTransfer = require('./secureTransfer');
const secureWalletTransfer = require('./secureWalletTransfer');
const secureWalletMutations = require('./secureWalletMutations');
const secureWalletCharge = require('./secureWalletCharge');
const secureTopupReview = require('./secureTopupReview');
const secureTransactionReview = require('./secureTransactionReview');

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
functions.rejectRechargeTransaction = secureTransactionReview.rejectRechargeTransaction;
functions.rejectInternetPackageTransaction = secureTransactionReview.rejectInternetPackageTransaction;
functions.rejectMobileBankingTransaction = secureTransactionReview.rejectMobileBankingTransaction;
functions.rejectRemittanceTransaction = secureTransactionReview.rejectRemittanceTransaction;

module.exports = functions;
