'use strict';

const { WalletProviderAdapter } = require('../walletProviderAdapter');

/**
 * MobilityOne adapter boundary.
 *
 * The provider's actual API paths, authentication scheme, request/response
 * fields and webhook signature must be filled only from MobilityOne's official
 * integration documentation/credentials. No endpoint is guessed here.
 */
class MobilityOneAdapter extends WalletProviderAdapter {
  get name() {
    return 'mobilityone';
  }

  async getBalance() {
    throw new Error('MobilityOne API contract is not configured yet.');
  }

  async createTopup() {
    throw new Error('MobilityOne API contract is not configured yet.');
  }

  async debit() {
    throw new Error('MobilityOne API contract is not configured yet.');
  }

  async refund() {
    throw new Error('MobilityOne API contract is not configured yet.');
  }

  async verifyWebhook() {
    throw new Error('MobilityOne webhook contract is not configured yet.');
  }
}

module.exports = { MobilityOneAdapter };
