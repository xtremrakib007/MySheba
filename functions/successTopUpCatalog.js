'use strict';

// Success TopUp's view of the generic package catalogue.
//
// Everything here now lives in providerCatalog.js, which does the same job for
// any provider that declares a catalogue. This module stays as the Success
// TopUp entry point: it pins the provider name and keeps the export names that
// walletService and apiProviderService already use, so the pricing path did not
// have to be rewritten to gain the generality.
//
// Two prices, and conflating them loses money or breaks the order:
//
//   cost  what Success TopUp charges us. It is the package's catalogue price
//         and it is what MUST go in /api/recharge's `amount` field alongside
//         package_id - send anything else and the provider rejects the order
//         or bills us for a package the customer did not buy.
//
//   sell  what the customer pays. Superadmin may override it per package
//         (internetPricing/{operator}.apiPackages[packageId].price). With no
//         override it equals cost, so the default behaviour is unchanged.
//
// The sell price is resolved on the SERVER from the live catalogue, never taken
// from the client.
const providerCatalog = require('./providerCatalog');
const driveWindow = require('./successTopUpWindow');

const PROVIDER_NAME = 'Success TopUp';
const BASE_URL = providerCatalog.PRESETS['success-topup'].baseUrl;

// Both catalogues, because a package id can live in either and an order only
// carries the id. `regular` first so it wins a duplicate id.
const CATALOG_TYPES = providerCatalog.PRESETS['success-topup'].types;

/**
 * The active Success TopUp provider for a service.
 *
 * It pins the provider NAME, which is the whole point of this module and also
 * its trap: it looks exactly like providerCatalog.readProvider, which takes a
 * country and a strict flag. A caller that passed those here had them silently
 * dropped and got Success TopUp back for a question about somebody else - the
 * per-number Malaysian plan listing did precisely that and could never have
 * found its provider. So options are refused rather than ignored: anything
 * that needs them wants providerCatalog.readProvider, not this.
 */
function readProvider(db, service, options) {
  if (options !== undefined) {
    throw new Error('successTopUpCatalog.readProvider pins the provider name and takes no options - use providerCatalog.readProvider for a country-scoped lookup.');
  }
  return providerCatalog.readProvider(db, service, { name: PROVIDER_NAME });
}

/**
 * Resolve one package by id, for an order that is about to be charged.
 * Returns an `error` when the id is not in the catalogue any more - the caller
 * must refuse the order rather than guess a price.
 */
async function resolveOrderPackage(args) {
  const result = await providerCatalog.resolveOrderPackage({ ...args, providerName: PROVIDER_NAME });
  // The generic engine names the error after the window; callers and tests
  // written against the Success TopUp flow expect the drive wording.
  if (result && result.error === 'window-closed') {
    return { ...result, error: 'drive-window-closed' };
  }
  return result;
}

module.exports = {
  BASE_URL,
  PROVIDER_NAME,
  isDriveWindowOpen: driveWindow.isDriveWindowOpen,
  CATALOG_TYPES,
  PRICING_COLLECTION: providerCatalog.PRICING_COLLECTION,
  sellPriceFor: providerCatalog.sellPriceFor,
  isHidden: providerCatalog.isHidden,
  readPricingDoc: providerCatalog.readPricingDoc,
  readProvider,
  resolveOrderPackage,
  _test: providerCatalog._test,
};
