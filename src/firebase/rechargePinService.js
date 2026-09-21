import { httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { functions } from './config';

const purchaseFn = httpsCallable(functions, 'purchaseRechargePin');

function requestId() {
  if (typeof Crypto.randomUUID !== 'function') throw new Error('Secure request identifier generation is unavailable. Please update the app.');
  return Crypto.randomUUID().replace(/-/g, '');
}

export async function purchaseRechargePin({ operator, amount }) {
  const { data } = await purchaseFn({ operator, amount, requestId: requestId() });
  return data;
}
