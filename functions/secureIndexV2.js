const functions = require('./index');
const guards = require('./chargeGuards');
const secureTransfer = require('./secureTransfer');
const secureGamePoints = require('./secureGamePoints');
const secureWalletTransfer = require('./secureWalletTransfer');

functions.chargeRecharge = guards.chargeRecharge;
functions.chargeInternetPackage = guards.chargeInternetPackage;
functions.chargeMobileBanking = guards.chargeMobileBanking;
functions.chargeRemittance = guards.chargeRemittance;
functions.transferPoints = secureTransfer.transferPoints;
functions.chargeGamePoints = secureGamePoints.chargeGamePoints;
functions.withdrawGamePoints = secureGamePoints.withdrawGamePoints;
functions.transferGamePoints = secureGamePoints.transferGamePoints;
functions.walletTransfer = secureWalletTransfer.walletTransfer;

module.exports = functions;
