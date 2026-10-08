'use strict';

/**
 * Generic regulated-wallet provider boundary.
 *
 * Provider implementations must never be called from the client. They receive
 * only server-side wallet operations and return a normalized result.
 */
class WalletProviderAdapter {
  constructor(config = {}) {
    this.config = config;
  }

  get name() {
    return 'unconfigured';
  }

  async getBalance() {
    throw new Error('Wallet provider balance operation is not configured.');
  }

  async createTopup() {
    throw new Error('Wallet provider top-up operation is not configured.');
  }

  async debit() {
    throw new Error('Wallet provider debit operation is not configured.');
  }

  async refund() {
    throw new Error('Wallet provider refund operation is not configured.');
  }

  async verifyWebhook() {
    throw new Error('Wallet provider webhook verification is not configured.');
  }
}

module.exports = { WalletProviderAdapter };
