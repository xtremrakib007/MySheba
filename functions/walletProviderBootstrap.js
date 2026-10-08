'use strict';

const { registerWalletProvider } = require('./walletProviderRegistry');
const { MobilityOneAdapter } = require('./walletProviders/mobilityOneAdapter');

let bootstrapped = false;

function ensureWalletProvidersRegistered() {
  if (bootstrapped) return;
  registerWalletProvider('mobilityone', new MobilityOneAdapter());
  bootstrapped = true;
}

module.exports = { ensureWalletProvidersRegistered };
