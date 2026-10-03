import * as Updates from 'expo-updates';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../firebase/config';

// Making the app show what is actually true right now.
//
// Almost everything on screen comes from a Firestore onSnapshot listener, so
// in the normal case there is nothing to refresh - it is already live. The
// cases where it is not are the ones a person notices:
//
//   - the phone lost the network, the listener detached, and the balance on
//     screen is whatever it was when the signal went;
//   - a superadmin changed a rate, a grid or a webview page and the person
//     wants to see it now rather than whenever the snapshot lands;
//   - a new JS bundle was published and the app is still running the old one.
//
// The first two are a reconnect; the third is a restart. This file does the
// reconnect and reports on the bundle; the caller decides about restarting,
// because a restart throws away a half-filled form and that is not a decision
// to take on somebody's behalf.
//
// No React here, so the flow can be read without a component around it.

/**
 * Force every live listener to reconnect and re-deliver.
 *
 * Firestore reconnects on its own eventually. "Eventually" is the complaint:
 * dropping the network and bringing it back makes the SDK tear down its
 * streams and re-establish them immediately, and every onSnapshot fires again
 * with server data.
 *
 * The enable is in a finally so a failed disable cannot leave the app offline
 * - that would turn a refresh button into a way to break the app.
 */
export async function resyncData() {
  try {
    await disableNetwork(db);
  } finally {
    await enableNetwork(db);
  }
}

/** Whether expo-updates can actually do anything here. False in dev. */
export function updatesActive() {
  return !__DEV__ && Updates.isEnabled;
}

/**
 * Is there a newer bundle on disk, ready to run?
 *
 * `pending` is what UpdateGate's automatic check may already have downloaded;
 * the caller reads it from the hook and passes it in. When a bundle is already
 * pending, checking again is worse than pointless: checkForUpdateAsync reports
 * it as available and fetchUpdateAsync then reports it as not new, which reads
 * as "no update" when one is sitting right there.
 */
export async function fetchUpdateIfAny(pending) {
  if (pending) return true;
  if (!updatesActive()) return false;
  const { isAvailable } = await Updates.checkForUpdateAsync();
  if (!isAvailable) return false;
  const { isNew } = await Updates.fetchUpdateAsync();
  return isNew === true;
}

/**
 * Restart into whatever bundle is current.
 *
 * Throws when updates are disabled, which is every development build - the
 * caller says so rather than failing silently, because a button that does
 * nothing is worse than one that explains itself.
 */
export async function reloadApp() {
  if (!updatesActive()) throw new Error('This build cannot restart itself. Close the app and open it again.');
  await Updates.reloadAsync();
}
