import { httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { functions } from './config';
import { getSessionProof } from './deviceSessionService';
import { forgetIimmpactOptionsOn } from './apiProviderService';

const purchaseFn = httpsCallable(functions, 'purchaseRechargePin');

function requestId() {
  if (typeof Crypto.randomUUID !== 'function') throw new Error('Secure request identifier generation is unavailable. Please update the app.');
  return Crypto.randomUUID().replace(/-/g, '');
}

// For a catalogue voucher the server re-reads the product and its options, so
// productCode/subproductCode only point at what was chosen; accountNumber is
// the Malaysian mobile number IIMMPACT validates the order against, and
// fieldValues/selectedOptions answer any other field the product declares.
export async function purchaseRechargePin({ operator = '', amount, country = 'MY', productCode = '', subproductCode = '', productName = '', accountNumber = '', fieldValues = {}, selectedOptions = {} }) {
  const session = await getSessionProof();
  try {
    const { data } = await purchaseFn({
      operator, amount, country, productCode, subproductCode, productName, accountNumber, fieldValues, selectedOptions,
      requestId: requestId(), ...session
    });
    return data;
  } catch (error) {
    // A kept denomination the server now refuses is dropped, so the retry
    // shows IIMMPACT's current amounts.
    forgetIimmpactOptionsOn(error, productCode);
    throw error;
  }
}

export async function getRechargePin(transactionId) {
  const { data } = await httpsCallable(functions, 'getRechargePin')({ transactionId });
  return data;
}
