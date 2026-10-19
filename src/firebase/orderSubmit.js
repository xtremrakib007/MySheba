import * as Crypto from 'expo-crypto';
import { auth } from './config';

// How long a purchase screen waits for the server before it lets the customer
// go. A provider can take a minute to answer; the order does not need the
// customer watching it. Past this the screen says "submitted", the call keeps
// running, History follows the order live and a push notification
// (functions/index.js onTransactionUpdated) says how it ended.
export const QUICK_SUBMIT_MS = 4000;

/**
 * Resolves `{ settled: true, value }` if `promise` resolves within `ms`, or
 * `{ settled: false }` once `ms` passes. A rejection inside the window is
 * thrown as it is, so validation errors (balance, rate changed) still show on
 * the screen that caused them.
 */
export function settleWithin(promise, ms = QUICK_SUBMIT_MS) {
  let timer;
  const wait = new Promise((resolve) => { timer = setTimeout(() => resolve({ settled: false }), ms); });
  return Promise.race([promise.then((value) => ({ settled: true, value })), wait])
    .finally(() => clearTimeout(timer));
}

// The label-to-key rule functions/chargeGuards.js serviceKey uses:
// 'Bill Payment' -> 'billpayment', 'IIMMPACT' -> 'iimmpact'.
export function serviceKey(label) {
  return String(label || '').trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * The id the server will give this order. Both functions/walletService.js
 * (chargeProduct) and functions/rechargePinService.js name the transaction
 * sha256("uid|service|requestId") cut to 40 hex characters, so the reference
 * is known before the reply comes back - which is what lets a screen show it
 * and move on while the provider is still working.
 */
export async function expectedTransactionId(service, requestId) {
  const uid = auth.currentUser?.uid || '';
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${uid}|${service}|${requestId}`);
  return String(hex).toLowerCase().slice(0, 40);
}
