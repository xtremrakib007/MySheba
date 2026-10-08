'use strict';

const { getWalletProvider } = require('./walletProviderRegistry');

/**
 * Resolves the active regulated-wallet adapter.
 *
 * Provider selection is server-side. Credentials must be supplied through
 * Secret Manager/environment by the eventual concrete adapter, never Firestore
 * or the mobile client.
 */
function getActiveWalletProvider(settings = {}) {
  const providerName = String(
    settings.walletProvider ||
    process.env.MYSHEBA_WALLET_PROVIDER ||
    ''
  ).trim();

  if (!providerName) return null;
  return getWalletProvider(providerName);
}

module.exports = { getActiveWalletProvider };
