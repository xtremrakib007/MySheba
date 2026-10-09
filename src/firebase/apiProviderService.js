import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const listFn = httpsCallable(functions, 'listApiProviders');
const saveFn = httpsCallable(functions, 'saveApiProvider');
const deleteFn = httpsCallable(functions, 'deleteApiProvider');
const getModesFn = httpsCallable(functions, 'getServiceApiSettings');
const saveModesFn = httpsCallable(functions, 'saveServiceApiSettings');
const drivesFn = httpsCallable(functions, 'listSuccessTopUpDrives');
const dataPlansFn = httpsCallable(functions, 'listProviderDataPlans');
const presentmentFn = httpsCallable(functions, 'getBillPresentment');
const networkStatusFn = httpsCallable(functions, 'getNetworkStatus');
const productCodesFn = httpsCallable(functions, 'listProviderProductCodes');
const iimmpactCatalogFn = httpsCallable(functions, 'getIimmpactCatalog');
const iimmpactUserCatalogFn = httpsCallable(functions, 'getIimmpactCatalogForUser');
const iimmpactFullCatalogFn = httpsCallable(functions, 'getIimmpactFullCatalogForUser');
const iimmpactAdminFullCatalogFn = httpsCallable(functions, 'getIimmpactFullCatalogForSuperadmin');
const iimmpactOptionsFn = httpsCallable(functions, 'getIimmpactOptions');
const chargeIimmpactProductFn = httpsCallable(functions, 'chargeIimmpactProduct');
const testFn = httpsCallable(functions, 'testApiProvider');
const adminCatalogFn = httpsCallable(functions, 'listSuccessTopUpCatalogForAdmin');
const balanceFn = httpsCallable(functions, 'getSuccessTopUpBalance');

// Must match ALLOWED_SERVICES in functions/apiProviderService.js. A service
// the backend routes but this list omits cannot be configured by a
// superadmin at all: 'Offer Packs' was missing, so the only provider that
// could ever serve it was the one Success TopUp provisions for itself.
// scripts/test-api-provider.js fails the build if the two lists drift.
export const API_SERVICES = ['Recharge', 'Internet', 'Offer Packs', 'Bill Payment', 'Bus', 'Train', 'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway', 'Entertainment', 'Recharge PIN', 'eSIM'];
export async function listApiProviders() { const res = await listFn({}); return res.data?.providers || res.data || []; }
export async function saveApiProvider(provider) { return (await saveFn(provider)).data; }

/**
 * Our floats with Success TopUp. Superadmin only, enforced in the callable -
 * this is trading capacity, not any customer's money.
 *
 * Returns { balance, driveBalance, checkedAt }. Drives are funded separately,
 * so either can be empty while the other is fine. Null means the provider did
 * not report that number; zero means it reported zero.
 */
export async function getSuccessTopUpBalance() { return (await balanceFn({})).data; }
export async function deleteApiProvider(id) { return (await deleteFn({ id })).data; }
export async function getServiceApiSettings() { return (await getModesFn({})).data; }
/**
 * Service defaults plus the per-country overrides. countryModes is what keeps
 * Bangladesh on the API while every other country keeps going to a human, so
 * it is sent on every save - omitting it would clear the matrix.
 */
export async function saveServiceApiSettings(modes, countryModes) { return (await saveModesFn({ modes, countryModes })).data; }

export async function testApiProvider(id) { return (await testFn({ id })).data; }

// drivesFn was built above but never exported, so InternetSteps' call to
// apiProviderService.listSuccessTopUpDrives resolved to undefined.
export async function listSuccessTopUpDrives(operator, type, service = 'Internet', operatorName = '') {
  return (await drivesFn({ operator, type, service, operatorName })).data?.drives || [];
}

/**
 * The data plans one number is eligible for, from the configured provider.
 *
 * `supported` is the answer to "does this country and operator have per-number
 * plans at all", and it is false far more often than it is true - most pairs
 * have no such provider and keep the package list they already had. It is
 * returned rather than inferred from an empty list, because "this operator
 * does not work this way" and "this number has no plans available" are
 * different things to tell somebody.
 */
export async function listProviderDataPlans({ service = 'Internet', country, operator, phone }) {
  const { data } = await dataPlansFn({ service, country, operator, phone });
  return { plans: data?.plans || [], supported: data?.supported === true };
}

/**
 * The bill behind an account number, where the provider can read one.
 *
 * Advisory: `blocking` is true for exactly one answer - the provider saying the
 * account number is not theirs. Everything else, including a failure, comes
 * back as "nothing to show" and the customer carries on. A rejected promise is
 * treated the same way for the same reason, so a caller never has to decide
 * whether a network error is a reason not to pay a bill.
 */
/**
 * Superadmin only: the provider's own product list, for filling in the code
 * maps. Nothing can be guessed here, so this is where the codes come from.
 */
export async function listProviderProductCodes(id) {
  return (await productCodesFn({ id })).data?.products || [];
}

export async function getIimmpactCatalog(id) {
  return (await iimmpactCatalogFn({ id })).data || {};
}

export async function getIimmpactCatalogForUser(providerId = '', service = 'Recharge', country = '') {
  return (await iimmpactUserCatalogFn({ providerId, service, country })).data || {};
}

export async function getIimmpactFullCatalogForUser(country = 'MY') {
  return (await iimmpactFullCatalogFn({ country })).data || {};
}

export async function getIimmpactFullCatalogForSuperadmin(country = 'MY') {
  const result = await iimmpactAdminFullCatalogFn({ country });
  return result.data || {};
}

export async function chargeIimmpactProduct(payload, customer = {}) {
  return (await chargeIimmpactProductFn({ payload, customer })).data || {};
}

export async function getIimmpactOptions({ providerId = '', productCode, fieldId, accountNumber = '', billerCode = '', page = 1, limit = 100, service = 'Recharge', country = '' }) {
  return (await iimmpactOptionsFn({ providerId, productCode, fieldId, accountNumber, billerCode, page, limit, service, country })).data || {};
}

/**
 * Whether the biller or operator is having problems right now.
 *
 * Advisory and nothing else - there is no field here that could stop a payment,
 * deliberately. A failure is silence rather than a warning: a scary sentence on
 * a healthy product talks somebody out of paying for no reason, which is the
 * only harm this feature is capable of.
 */
export async function getNetworkStatus(input) {
  try {
    const { data } = await networkStatusFn(input);
    return { status: data?.status || 'unknown', notice: data?.notice || '' };
  } catch {
    return { status: 'unknown', notice: '' };
  }
}

export async function getBillPresentment(input) {
  const blank = { status: 'unavailable', blocking: false, message: '', fields: [], outstanding: null };
  try {
    const { data } = await presentmentFn(input);
    return { ...blank, ...(data || {}) };
  } catch {
    return blank;
  }
}

/** Superadmin only: the catalogue with cost, sell and hidden state per package. */
export async function listSuccessTopUpCatalogForAdmin({ operator, operatorName, type, service }) {
  const { data } = await adminCatalogFn({ operator, operatorName, type, service });
  return {
    packages: data?.packages || [],
    driveWindowOpen: data?.driveWindowOpen !== false,
    driveWindowLabel: data?.driveWindowLabel || '',
  };
}
