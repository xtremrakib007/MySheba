'use strict';

// Success TopUp package catalogue, and the price Superadmin sells it at.
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
// The sell price is resolved HERE, on the server, from the live catalogue. It is
// never taken from the client: chargeProduct used to convert whatever `amount`
// the app submitted, so a tampered client could have named an expensive
// package_id with a one-taka amount.
const driveWindow = require('./successTopUpWindow');

const BASE_URL = 'https://api.successtopup.com';
const PRICING_COLLECTION = 'internetPricing';
const PROVIDER_COLLECTION = 'api_providers';

// Both catalogues, because a package id can live in either and an order only
// carries the id. `regular` first so it wins a duplicate id.
const CATALOG_TYPES = ['regular', 'drive'];

function pickOverride(pricingDoc, packageId) {
  const apiPackages = (pricingDoc && pricingDoc.apiPackages) || {};
  const entry = apiPackages[packageId];
  return entry && typeof entry === 'object' ? entry : null;
}

/** The customer-facing price for one catalogue entry. */
function sellPriceFor(pkg, pricingDoc) {
  const override = pickOverride(pricingDoc, pkg.id);
  const overridden = override ? Number(override.price) : NaN;
  if (Number.isFinite(overridden) && overridden > 0) return Math.round(overridden * 100) / 100;
  return pkg.price;
}

/** Whether Superadmin has hidden this package from customers. */
function isHidden(pkg, pricingDoc) {
  const override = pickOverride(pricingDoc, pkg.id);
  return !!(override && override.hidden === true);
}

async function readPricingDoc(db, operatorName) {
  if (!operatorName) return {};
  const snap = await db.collection(PRICING_COLLECTION).doc(String(operatorName)).get();
  return snap.exists ? (snap.data() || {}) : {};
}

async function readProvider(db, service) {
  const snap = await db.collection(PROVIDER_COLLECTION)
    .where('service', '==', service)
    .where('name', '==', 'Success TopUp')
    .where('active', '==', true)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() || {}) };
}

/**
 * Resolve one package by id, for an order that is about to be charged.
 * Returns null when the id is not in either catalogue any more - the caller
 * must refuse the order rather than guess a price.
 */
async function resolveOrderPackage({ db, service, operatorName, operatorCode, packageId, fetchCatalog }) {
  const provider = await readProvider(db, service);
  if (!provider || !provider.apiKey || !provider.secretKey) return { error: 'provider-unconfigured' };

  const pricingDoc = await readPricingDoc(db, operatorName);
  const driveOpen = driveWindow.isDriveWindowOpen();
  for (const type of CATALOG_TYPES) {
    if (type === 'drive' && !driveOpen) continue;
    let packages;
    try {
      packages = await fetchCatalog(provider, operatorCode || 'ALL', type);
    } catch (err) {
      return { error: 'catalog-unreachable', message: err && err.message };
    }
    const match = packages.find((p) => String(p.id) === String(packageId));
    if (!match) continue;
    if (isHidden(match, pricingDoc)) return { error: 'package-hidden' };
    return {
      package: match,
      costAmount: match.price,
      sellAmount: sellPriceFor(match, pricingDoc),
    };
  }
  if (!driveOpen) {
    const provider2 = await readProvider(db, service);
    if (provider2) {
      try {
        const driveOnly = await fetchCatalog(provider2, operatorCode || 'ALL', 'drive');
        if (driveOnly.some((p) => String(p.id) === String(packageId))) {
          return { error: 'drive-window-closed', message: driveWindow.driveWindowMessage() };
        }
      } catch (err) { /* fall through to not-found */ }
    }
  }
  return { error: 'package-not-found' };
}

module.exports = {
  BASE_URL,
  isDriveWindowOpen: driveWindow.isDriveWindowOpen,
  CATALOG_TYPES,
  PRICING_COLLECTION,
  sellPriceFor,
  isHidden,
  readPricingDoc,
  readProvider,
  resolveOrderPackage,
  _test: { pickOverride, sellPriceFor, isHidden },
};
