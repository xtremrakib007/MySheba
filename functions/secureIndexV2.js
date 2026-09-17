const functions = require('./index');
const guards = require('./chargeGuards');
const secureTransfer = require('./secureTransfer');
const secureWalletTransfer = require('./secureWalletTransfer');
const secureWalletMutations = require('./secureWalletMutations');
const secureWalletCharge = require('./secureWalletCharge');
const secureTopupReview = require('./secureTopupReview');
const rejectionService = require('./rejectionService');
const transactionService = require('./transactionService');
const googleLinkService = require('./markGoogleLinked');
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
functions.markGoogleLinked = googleLinkService.markGoogleLinked;

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
