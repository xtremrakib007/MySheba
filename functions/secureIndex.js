const functions = require('./index');
const guards = require('./chargeGuards');
const secureTransfer = require('./secureTransfer');

// Preserve every existing callable export, but replace wallet-changing
// endpoints with guarded versions. Customer identity for product charges is
// rebuilt from request.auth.uid; point transfers use an atomic idempotency
// record so a repeated requestId cannot debit twice.
functions.chargeRecharge = guards.chargeRecharge;
functions.chargeInternetPackage = guards.chargeInternetPackage;
functions.chargeMobileBanking = guards.chargeMobileBanking;
functions.chargeRemittance = guards.chargeRemittance;
functions.transferPoints = secureTransfer.transferPoints;

module.exports = functions;
