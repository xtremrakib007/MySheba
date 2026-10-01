import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const listFn = httpsCallable(functions, 'listApiProviders');
const saveFn = httpsCallable(functions, 'saveApiProvider');
const deleteFn = httpsCallable(functions, 'deleteApiProvider');
const getModesFn = httpsCallable(functions, 'getServiceApiSettings');
const saveModesFn = httpsCallable(functions, 'saveServiceApiSettings');
const drivesFn = httpsCallable(functions, 'listSuccessTopUpDrives');
const testFn = httpsCallable(functions, 'testApiProvider');

export const API_SERVICES = ['Recharge', 'Internet', 'Bill Payment', 'Bus', 'Train', 'Flight', 'Mobile Banking', 'Remittance', 'Payment Gateway', 'Entertainment', 'Recharge PIN'];
export async function listApiProviders() { const res = await listFn({}); return res.data?.providers || res.data || []; }
export async function saveApiProvider(provider) { return (await saveFn(provider)).data; }
export async function deleteApiProvider(id) { return (await deleteFn({ id })).data; }
export async function getServiceApiSettings() { return (await getModesFn({})).data; }
export async function saveServiceApiSettings(modes) { return (await saveModesFn({ modes })).data; }

export async function testApiProvider(id) { return (await testFn({ id })).data; }

// drivesFn was built above but never exported, so InternetSteps' call to
// apiProviderService.listSuccessTopUpDrives resolved to undefined.
export async function listSuccessTopUpDrives(operator, type) {
  return (await drivesFn({ operator, type })).data?.drives || [];
}
