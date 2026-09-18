// Backs the "pay on success" webviews - Bus (redBus/Bus Online Ticket/
// Easybook) and MY e-SIM (see PAYMENT_CHARGED_WEBVIEWS in
// src/data/countries.js). Unlike
// webviewAccessService's flows, these never charge just for opening the
// page: the ticket/SIM itself is paid for directly on the third-party
// site, and MySheba only takes its points fee once that purchase has
// actually gone through (see confirmPaymentSuccess in AppContext.js).
//
// The flip side of "we only charge on success" is that we can never let
// someone in who can't pay the fee at all - once they're inside the
// WebView they can complete a real purchase on redbus.my/
// busonlineticket.com/easybook.com/CelcomDigi with zero further
// involvement from this app, so there is no later point at which we could
// still safely deduct. checkPaymentEntryAccess is therefore called before
// navigation ever happens (AppContext.openWebView)
// and blocks entry outright if the balance is too low - it never deducts
// anything itself, it only answers "can they afford this right now". It
// stays a plain read here (not worth a Cloud Function round trip for a
// non-authoritative pre-check) - the actual deduction below is what's
// enforced server-side.
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './config';
import { PAYMENT_SUCCESS_COST } from '../data/countries';
import { getSessionProof } from './deviceSessionService';

/**
 * Read-only gate: throws (with a message safe to show the user) if `uid`'s
 * wallet can't cover `cost` (defaults to PAYMENT_SUCCESS_COST, but callers
 * should pass the live admin-set value - see
 * AppContext.pointCosts/settingsService.js). Never deducts anything - just
 * decides whether AppContext.openWebView is allowed to navigate in at all.
 */
export async function checkPaymentEntryAccess(uid, cost = PAYMENT_SUCCESS_COST) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) throw new Error('Account not found.');
  const balance = snap.data().walletBalance || 0;
  if (balance < cost) {
    throw new Error(`You need ${cost} pts to use this - top up your wallet first.`);
  }
  return { balance };
}

/**
 * Deducts the admin-set cost (read server-side from settings/pricing - the
 * `cost` param above is a display-only pre-check, not what's actually
 * charged) from `uid` the moment a payment success is detected (or
 * self-confirmed) for `key` ('bus-redbus' | 'bus-busonlineticket' |
 * 'bus-easybook' | 'esim'). The
 * chargeWallet Cloud Function (functions/walletService.js, kind
 * 'payment_success') runs this as a Firestore transaction so a rapid
 * double-fire (the URL-match listener and the manual "I've completed my
 * payment" button both racing in) can never double-charge the same
 * purchase. WebViewScreen/AppContext are still responsible for only
 * calling this once per WebView session (hasFiredRef) - this only
 * protects the wallet, not the click count.
 */
export async function chargePaymentSuccess(uid, key, cost = PAYMENT_SUCCESS_COST) {
  const fn = httpsCallable(functions, 'chargeWallet');
  try {
    const session = await getSessionProof();
    const { data } = await fn({ kind: 'payment_success', key, ...session });
    return data;
  } catch (err) {
    throw new Error(err.message || `You need ${cost} pts to confirm this payment - top up your wallet first.`);
  }
}
