import { httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { functions } from './config';
import { getSessionProof } from './deviceSessionService';

const purchaseFn = httpsCallable(functions, 'purchaseRechargePin');

function requestId() {
  if (typeof Crypto.randomUUID !== 'function') throw new Error('Secure request identifier generation is unavailable. Please update the app.');
  return Crypto.randomUUID().replace(/-/g, '');
}

export async function purchaseRechargePin({ operator, amount, country = 'MY', productCode = '', subproductCode = '', productName = '' }) {
  const session = await getSessionProof();
  const { data } = await purchaseFn({
    operator, amount, country, productCode, subproductCode, productName,
    requestId: requestId(), ...session
  });
  return data;
}

export async function getRechargePin(transactionId) {
  const { data } = await httpsCallable(functions, 'getRechargePin')({ transactionId });
  return data;
}
