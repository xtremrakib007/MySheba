// The security PIN, kept on this device so a fingerprint can stand in for it.
//
// Why this exists at all: the PIN is verified SERVER side. walletTransfer
// (functions/walletTransferService.js:106) requires the actual digits, scrypt-
// hashes them and compares - so the server, not the app, decides whether a
// transfer is allowed. A fingerprint cannot produce those digits. The only way
// biometric can stand in for the PIN on a money operation is for the device to
// remember the PIN and replay it once the fingerprint has passed.
//
// That is a real trade-off and it was made deliberately: the PIN now exists on
// the handset, so anyone who can defeat the device biometric can move money.
// It is the same bargain banking apps make, and it is why every part of this
// is opt-in, per device, and thrown away the moment it stops being wanted.
//
// What limits the damage:
//   - expo-secure-store, so the value sits in the Android Keystore /  iOS
//     Keychain rather than in app storage anything can read.
//   - Stored only after the SERVER has confirmed the PIN is correct, so a
//     wrong guess can never be cached and replayed.
//   - Keyed per uid. Another account signing in on the same phone cannot
//     reach the previous one's PIN.
//   - Cleared on logout, on opting out, and whenever the server rejects a
//     stored PIN (which means it was changed elsewhere and this copy is
//     stale).
//
// Everything here fails soft. A device with no keystore, a denied read, a
// wiped entry: the caller simply falls back to asking for the PIN, which
// always works.
import * as SecureStore from 'expo-secure-store';

// SecureStore keys must be alphanumeric, '.', '-' or '_'. A Firebase uid is
// already within that set, but normalise anyway rather than trust it.
const keyFor = (uid) => `mysheba_pin_v1_${String(uid || '').replace(/[^A-Za-z0-9._-]/g, '')}`;

/** True when this device can hold a PIN at all. */
export async function isVaultAvailable() {
  try {
    return await SecureStore.isAvailableAsync();
  } catch (e) {
    return false;
  }
}

/**
 * Remember a PIN the server has already accepted.
 *
 * Only ever called after a successful verifySecurityPin / a successful
 * transfer, never straight from the text field - caching an unverified guess
 * would mean replaying a wrong PIN and locking the account out against its
 * own attempt limit.
 */
export async function rememberPin(uid, pin) {
  if (!uid || !pin) return false;
  try {
    await SecureStore.setItemAsync(keyFor(uid), String(pin), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return true;
  } catch (e) {
    return false;
  }
}

/** The stored PIN, or null. Caller must have passed biometric first. */
export async function readPin(uid) {
  if (!uid) return null;
  try {
    return await SecureStore.getItemAsync(keyFor(uid));
  } catch (e) {
    return null;
  }
}

/** Whether anything is stored for this account on this device. */
export async function hasPin(uid) {
  return (await readPin(uid)) != null;
}

/** Forget it. Logout, opt-out, and a server rejection all land here. */
export async function forgetPin(uid) {
  if (!uid) return;
  try {
    await SecureStore.deleteItemAsync(keyFor(uid));
  } catch (e) {
    // Nothing to do - a PIN that cannot be deleted is also one that could
    // not be read, and every read path treats a failure as "ask for it".
  }
}
