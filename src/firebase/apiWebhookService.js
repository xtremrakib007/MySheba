import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const listFn = httpsCallable(functions, 'listApiWebhooks');
const saveFn = httpsCallable(functions, 'saveApiWebhook');
const deleteFn = httpsCallable(functions, 'deleteApiWebhook');

export async function listApiWebhooks() { return (await listFn({})).data?.webhooks || []; }
export async function saveApiWebhook(config) { return (await saveFn(config)).data; }
export async function deleteApiWebhook(providerId) { return (await deleteFn({ providerId })).data; }
