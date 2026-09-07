// FOMEMA/Visa status-check webviews cost a small number of points, charged
// when the user taps the government page's own "Carian"/"Search" button -
// unless they're still inside the free access window from an earlier
// charge on the same key (admin-set hours, see WEBVIEW_ACCESS_WINDOW_HOURS
// in data/countries.js / pricing.webviewAccessWindowHours).
//
// The actual charge happens inside the chargeWallet Cloud Function
// (functions/walletService.js: kind 'webview_access' / 'webview_submit'),
// not here - it re-reads the live admin-set cost from settings/pricing
// itself (never trusts a client-supplied cost) and re-checks the free-
// window flag from the user's own doc inside a Firestore transaction, so a
// rapid double-tap (or the same link opened from two devices at once) can
// never double-charge a single click. firestore.rules freezes walletBalance
// on every client write, so this file has no way to charge anything on its
// own even if it tried - the Cloud Function is the only path.
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';
import { WEBVIEW_ACCESS_COST, WEBVIEW_SUBMIT_COST } from '../data/countries';

const chargeWalletFn = httpsCallable(functions, 'chargeWallet');

/**
 * Charges points (admin-set cost, read server-side - the `cost` params from
 * data/countries.js are display-only fallbacks used elsewhere in the UI
 * before this resolves) for `uid`'s search on `key` ('fomema' | 'visa') -
 * unless a charge on this same key already happened within the admin-set
 * free window, in which case this search is free. Throws (with a message
 * safe to show the user) if their balance is too low to cover a charge
 * that's actually due.
 */
export async function ensureWebviewAccess(uid, key) {
  try {
    const { data } = await chargeWalletFn({ kind: 'webview_access', key });
    return data;
  } catch (err) {
    throw new Error(err.message || `You need ${WEBVIEW_ACCESS_COST} pts to check this - top up your wallet first.`);
  }
}

/**
 * Charges points the first (and only) time `uid` taps "I've submitted my
 * application" for `key` ('mydigital'). Re-tapping after a successful
 * charge is a no-op (returns { charged: false, submittedAt }) rather than
 * charging again - the flag lives on the user's own doc
 * (users/{uid}.webviewSubmitted.{key}) so it survives app restarts/devices.
 * Throws (with a message safe to show the user) if their balance is too low.
 */
export async function chargeWebviewSubmission(uid, key) {
  try {
    const { data } = await chargeWalletFn({ kind: 'webview_submit', key });
    return data;
  } catch (err) {
    throw new Error(err.message || `You need ${WEBVIEW_SUBMIT_COST} pts to confirm this - top up your wallet first.`);
  }
}
