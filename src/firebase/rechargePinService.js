import { httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, functions } from './config';
import { getSessionProof } from './deviceSessionService';
import { forgetIimmpactOptionsOn } from './apiProviderService';
import { settleWithin, expectedTransactionId } from './orderSubmit';

const purchaseFn = httpsCallable(functions, 'purchaseRechargePin');

function requestId() {
  if (typeof Crypto.randomUUID !== 'function') throw new Error('Secure request identifier generation is unavailable. Please update the app.');
  return Crypto.randomUUID().replace(/-/g, '');
}

// For a catalogue voucher the server re-reads the product and its options, so
// productCode/subproductCode only point at what was chosen; accountNumber is
// the Malaysian mobile number IIMMPACT validates the order against, and
// fieldValues/selectedOptions answer any other field the product declares.
export async function purchaseRechargePin({ operator = '', amount, country = 'MY', productCode = '', subproductCode = '', productName = '', accountNumber = '', fieldValues = {}, selectedOptions = {}, requestId: givenRequestId = '' }) {
  const session = await getSessionProof();
  try {
    const { data } = await purchaseFn({
      operator, amount, country, productCode, subproductCode, productName, accountNumber, fieldValues, selectedOptions,
      requestId: givenRequestId || requestId(), ...session
    });
    return data;
  } catch (error) {
    // A kept denomination the server now refuses is dropped, so the retry
    // shows IIMMPACT's current amounts.
    forgetIimmpactOptionsOn(error, productCode);
    throw error;
  }
}

/**
 * purchaseRechargePin without holding the customer on the review page. Resolves
 * `{ settled: true, value }` when the server answered within the quick window,
 * else `{ settled: false, id, done }`: `id` is the order the server is writing
 * (functions/rechargePinService.js names it uid|recharge-pin|requestId) and
 * `done` the purchase, still running.
 */
export async function submitRechargePin(args) {
  const id = requestId();
  const expectedId = await expectedTransactionId('recharge-pin', id);
  const done = purchaseRechargePin({ ...args, requestId: id });
  const quick = await settleWithin(done);
  return quick.settled ? quick : { settled: false, id: expectedId, done };
}

// The server checks this device's session before handing a PIN back; without
// the proof every read failed with "secure session missing".
export async function getRechargePin(transactionId) {
  const session = await getSessionProof();
  const { data } = await httpsCallable(functions, 'getRechargePin')({ transactionId, ...session });
  return data;
}

/**
 * A voucher accepted as "processing": wait for the provider to release it
 * (functions/apiWebhookService.js saves it), then read it back. Resolves with
 * the voucher, or null if it has not arrived within `timeoutMs`; rejects if
 * the order failed.
 */
export function waitForRechargePin(transactionId, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    let unsubscribe = () => {};
    const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); unsubscribe(); fn(value); };
    const timer = setTimeout(() => finish(resolve, null), timeoutMs);
    unsubscribe = onSnapshot(doc(db, 'transactions', String(transactionId)), (snap) => {
      const tx = snap.data() || {};
      if (tx.status === 'failed') finish(reject, new Error(tx.apiError || 'The provider could not issue this voucher. Your wallet was refunded.'));
      else if (tx.status === 'completed' && tx.rechargePinAvailable === true) {
        getRechargePin(transactionId).then((v) => finish(resolve, v), (e) => finish(reject, e));
      }
    }, () => finish(resolve, null));
  });
}
