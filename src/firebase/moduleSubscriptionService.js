// Firestore/Cloud Function access for the Notepad / My Documents / Salary &
// OT monthly subscriptions - same shape as webviewAccessService's
// access-window charge (ensureWebviewAccess), just with a month-long
// window (settings/pricing.moduleSubscriptionDays) instead of an
// hours-long one, and its own cost field per module
// (notepadCost / myDocumentsCost / salaryOtCost).
//
// The actual charge happens inside the chargeWallet Cloud Function
// (functions/walletService.js: kind 'module_subscription'), not here - it
// re-reads the live admin-set price and re-checks the subscription window
// from the user's own doc (users/{uid}.moduleSubscription.{key}) inside a
// Firestore transaction, so this file has no way to charge anything on its
// own. Called from AppContext.ensureModuleAccess, which gates
// openNotepad/openMyDocuments/openSalary/openSalaryReports.
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';
import { getSessionProof } from './deviceSessionService';

const chargeWalletFn = httpsCallable(functions, 'chargeWallet');

export const MODULE_KEYS = { notepad: 'notepad', myDocuments: 'myDocuments', salaryOt: 'salaryOt' };

/**
 * Charges points (admin-set monthly cost, read server-side - any cost
 * shown in the UI before this resolves is a display-only value from
 * AppContext.moduleSubscriptionCosts) for `uid`'s access to `key`
 * ('notepad' | 'myDocuments' | 'salaryOt') - unless a charge on this key
 * already happened within the current subscription window, in which case
 * this open is free and { charged: false, subscribedUntil } is returned.
 * Throws (with a message safe to show the user) if their balance can't
 * cover a charge that's actually due.
 */
export async function ensureModuleSubscription(uid, key) {
  try {
    const session = await getSessionProof();
    const { data } = await chargeWalletFn({ kind: 'module_subscription', key, ...session });
    return data;
  } catch (err) {
    throw new Error(err.message || 'Could not start this subscription - top up your wallet first.');
  }
}
