import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const listFn = httpsCallable(functions, 'listApiProviders');
const saveFn = httpsCallable(functions, 'saveApiProvider');
const deleteFn = httpsCallable(functions, 'deleteApiProvider');
const getModesFn = httpsCallable(functions, 'getServiceApiSettings');
const saveModesFn = httpsCallable(functions, 'saveServiceApiSettings');
const drivesFn = httpsCallable(functions, 'listSuccessTopUpDrives');
const testFn = httpsCallable(functions, 'testApiProvider');
const adminCatalogFn = httpsCallable(functions, 'listSuccessTopUpCatalogForAdmin');
const balanceFn = httpsCallable(functions, 'getSuccessTopUpBalance');

// Must match ALLOWED_SERVICES in functions/apiProviderService.js. A service
// the backend routes but this list omits cannot be configured by a
// superadmin at all: 'Offer Packs' was missing, so the only provider that
// could ever serve it was the one Success TopUp provisions for itself.
// scripts/test-api-provider.js fails the build if the two lists drift.
export const API_SERVICES = ['Recharge', 'Internet', 'Offer Packs', 'Bill Payment', 'Bus', 'Train', 'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway', 'Entertainment', 'Recharge PIN'];
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
export async function saveServiceApiSettings(modes) { return (await saveModesFn({ modes })).data; }

export async function testApiProvider(id) { return (await testFn({ id })).data; }

// drivesFn was built above but never exported, so InternetSteps' call to
// apiProviderService.listSuccessTopUpDrives resolved to undefined.
export async function listSuccessTopUpDrives(operator, type, service = 'Internet', operatorName = '') {
  return (await drivesFn({ operator, type, service, operatorName })).data?.drives || [];
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
