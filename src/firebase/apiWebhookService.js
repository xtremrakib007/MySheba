import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const listFn = httpsCallable(functions, 'listApiWebhooks');
const saveFn = httpsCallable(functions, 'saveApiWebhook');
const deleteFn = httpsCallable(functions, 'deleteApiWebhook');
const revealFn = httpsCallable(functions, 'revealApiWebhookToken');
const rotateFn = httpsCallable(functions, 'rotateApiWebhookToken');
const unmatchedFn = httpsCallable(functions, 'listApiWebhookUnmatched');

export async function listApiWebhooks() { return (await listFn({})).data?.webhooks || []; }
export async function saveApiWebhook(config) { return (await saveFn(config)).data; }
export async function deleteApiWebhook(providerId) { return (await deleteFn({ providerId })).data; }

/**
 * The webhook token, shown again on demand.
 *
 * It is only ever displayed once at save time, so without this a dismissed
 * alert leaves the integration half-configured with no way back: the token
 * still has to be pasted into the provider's own API settings page.
 */
export async function revealApiWebhookToken(providerId) { return (await revealFn({ providerId })).data; }

/**
 * A fresh token, returned once. Callbacks signed with the old one are rejected
 * from this moment until the new token is saved on the provider's side too.
 */
export async function rotateApiWebhookToken(providerId) { return (await rotateFn({ providerId })).data; }

/** Recent callbacks that matched no transaction - the diagnostic for id mapping. */
export async function listApiWebhookUnmatched(providerId) { return (await unmatchedFn({ providerId })).data?.unmatched || []; }
