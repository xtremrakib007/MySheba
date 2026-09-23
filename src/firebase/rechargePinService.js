// Client wrapper for the prepaid recharge PIN (e-PIN) inventory. The PIN
// pool itself is unreadable from the app by design (see firestore.rules) -
// everything here goes through the Cloud Functions in
// functions/rechargePinService.js, which are the only thing that can hand a
// code out, and only onto the one order it was issued for.
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';
import { logActivity, logError } from './logService';

/**
 * Issues a PIN from stock for a Recharge order and writes it onto the
 * transaction. Resolves with { pin, serial, expiresAt }.
 */
export async function issueRechargePin(transactionId) {
  try {
    const { data } = await httpsCallable(functions, 'issueRechargePin')({ transactionId });
    logActivity('recharge_pin_issued', { transactionId });
    return data;
  } catch (e) {
    logError('rechargePinService.issueRechargePin', e);
    throw new Error(e.message || 'Could not issue a recharge PIN.');
  }
}

/** Available PIN counts per country/operator/denomination. Counts only. */
export async function fetchPinStock() {
  try {
    const { data } = await httpsCallable(functions, 'rechargePinStock')({});
    return Array.isArray(data?.rows) ? data.rows : [];
  } catch (e) {
    logError('rechargePinService.fetchPinStock', e);
    return [];
  }
}
