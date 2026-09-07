// Client half of the secondary "security PIN" gate (My Documents
// view/share, Transfer Points send, Notepad). Server half + full flow
// docs live in functions/securityPinService.js. See SecurityPinGate.js /
// SecurityPinModal.js for where these get called, and AppContext's
// requireSecurityPin() for how a screen asks for the gate in the first
// place.
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

/** First-time setup. Throws (with a user-facing message) if a PIN is already set. */
export async function setupSecurityPin(pin) {
  const fn = httpsCallable(functions, 'setupSecurityPin');
  const { data } = await fn({ pin });
  return data;
}

/** Verifies a PIN attempt. Throws (with a user-facing message) if it's wrong, or the account is temporarily locked out. */
export async function verifySecurityPin(pin) {
  const fn = httpsCallable(functions, 'verifySecurityPin');
  const { data } = await fn({ pin });
  return data;
}

/** Replaces an existing PIN (or creates one if somehow missing). Caller must have just
 * reauthenticated with the account's login password - see AppContext.resetSecurityPin. */
export async function resetSecurityPin(pin) {
  const fn = httpsCallable(functions, 'resetSecurityPin');
  const { data } = await fn({ pin });
  return data;
}
