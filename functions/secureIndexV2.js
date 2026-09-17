const functions = require('./index');
const guards = require('./chargeGuards');
const secureTransfer = require('./secureTransfer');
const secureWalletTransfer = require('./secureWalletTransfer');
const secureWalletMutations = require('./secureWalletMutations');
const secureWalletCharge = require('./secureWalletCharge');
const secureTopupReview = require('./secureTopupReview');
const secureTransactionRejection = require('./secureTransactionRejection');

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
functions.rejectRechargeTransaction = secureTransactionRejection.rejectRechargeTransaction;
functions.rejectInternetPackageTransaction = secureTransactionRejection.rejectInternetPackageTransaction;
functions.rejectMobileBankingTransaction = secureTransactionRejection.rejectMobileBankingTransaction;
functions.rejectRemittanceTransaction = secureTransactionRejection.rejectRemittanceTransaction;

module.exports = functions;
