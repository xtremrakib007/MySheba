'use strict';

const { WalletProviderAdapter } = require('./walletProviderAdapter');

/**
 * Server-side registry for regulated wallet providers.
 * This deliberately contains no provider credentials or guessed API endpoints.
 */
const adapters = new Map();

function registerWalletProvider(name, adapter) {
  const key = String(name || '').trim().toLowerCase();
  if (!key || !(adapter instanceof WalletProviderAdapter)) {
    throw new TypeError('A provider name and WalletProviderAdapter are required.');
  }
  adapters.set(key, adapter);
}

function getWalletProvider(name) {
  const key = String(name || '').trim().toLowerCase();
  return adapters.get(key) || null;
}

function listWalletProviders() {
  return [...adapters.keys()];
}

module.exports = { registerWalletProvider, getWalletProvider, listWalletProviders };
