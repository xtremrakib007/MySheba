const functions = require('./index');
const guards = require('./chargeGuards');

// Preserve every existing callable export, but replace the four charge
// endpoints with guarded versions. This prevents a client from spoofing the
// customer object passed to the wallet charging functions.
functions.chargeRecharge = guards.chargeRecharge;
functions.chargeInternetPackage = guards.chargeInternetPackage;
functions.chargeMobileBanking = guards.chargeMobileBanking;
functions.chargeRemittance = guards.chargeRemittance;

module.exports = functions;
