// Whether App Lock (PIN/biometric gate shown on launch and on returning
// from background - see AppLockScreen.js + AppContext's appLocked state)
// is turned on. It lives in plain AsyncStorage rather than Firestore or
// the encrypted secureLocalStorage wrapper (a boolean isn't sensitive the
// way an auth token is - see secureLocalStorage.js's own reasoning for
// that distinction). The actual PIN this gate checks against is the
// account's existing security PIN (functions/securityPinService.js, same
// one that protects My Documents/Transfer Points/Notepad) - nothing
// PIN-related is stored here.
//
// Keyed per account. It used to be one flag for the whole device, which
// did not match the thing it gates: the flag was the device's but the PIN
// it checks is the account's. So a lock one person switched on stayed on
// for whoever signed in next on that phone, against a PIN they had never
// chosen to be asked for. Logout cleared the biometric pref and left this
// one, so it survived the account it belonged to.
import AsyncStorage from '@react-native-async-storage/async-storage';

// The device-wide key this replaced. Read once per account, then removed.
const LEGACY_KEY = 'mysheba_app_lock_enabled_v1';
const keyFor = (uid) => `mysheba_app_lock_enabled_v2:${uid}`;

export const DEFAULT_APP_LOCK_ENABLED = true;

export async function getAppLockEnabled(uid) {
  if (!uid) return false;
  try {
    const own = await AsyncStorage.getItem(keyFor(uid));
    if (own !== null) return own === '1';
    // First read for this account since the key became per-account. Adopt
    // whatever the device-wide flag said, then drop it so it cannot reach
    // a second account. Carrying it over rather than defaulting to off is
    // deliberate: this is a protective gate, and silently turning it off
    // for the person who switched it on is the worse of the two mistakes.
    // Inheriting it wrongly only costs them a PIN prompt they can turn off.
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    // Never chosen on this device, for this account: on.
    //
    // App Lock protects a wallet, a transaction history and other people's
    // KYC documents, and the app deliberately keeps everyone signed in
    // until they log out by hand - so an unlocked reopen is the whole
    // session, not one screen. Defaulting off meant that protection existed
    // only for whoever went looking for the toggle.
    //
    // It only takes effect once the account has a security PIN. Locking an
    // account that cannot unlock would strand it, so AppContext gates on
    // profile.securityPinSet - see the launch-lock effect there.
    if (legacy === null) return DEFAULT_APP_LOCK_ENABLED;
    await AsyncStorage.setItem(keyFor(uid), legacy);
    await AsyncStorage.removeItem(LEGACY_KEY);
    return legacy === '1';
  } catch (e) {
    return false;
  }
}

export async function setAppLockEnabledPref(uid, value) {
  if (!uid) return;
  try {
    await AsyncStorage.setItem(keyFor(uid), value ? '1' : '0');
  } catch (e) {
    // Best-effort - worst case the toggle doesn't persist across restarts.
  }
}

// Whether the person has opted IN to biometric unlock for App Lock -
// separate from isBiometricAvailable() (biometricAuth.js), which only says
// the device/OS is capable. This is the person's own decision, asked once
// per login via BiometricOptInPrompt.js right after sign-in. Three states:
// true (opted in), false (said "Not Now" this login), null/unset (never
// asked yet on this device - shows the prompt). Cleared on every logout
// (clearBiometricEnabledPref) so the prompt asks again after the next
// sign-in, new account or same one - the person's own stated rule.
const BIOMETRIC_KEY = 'mysheba_biometric_enabled_v1';

export async function getBiometricEnabledPref() {
  try {
    const v = await AsyncStorage.getItem(BIOMETRIC_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  } catch (e) {
    return null;
  }
}

export async function setBiometricEnabledPref(value) {
  try {
    await AsyncStorage.setItem(BIOMETRIC_KEY, value ? '1' : '0');
  } catch (e) {
    // Best-effort, same as setAppLockEnabledPref above.
  }
}

export async function clearBiometricEnabledPref() {
  try {
    await AsyncStorage.removeItem(BIOMETRIC_KEY);
  } catch (e) {
    // Best-effort - worst case the next login doesn't re-prompt once.
  }
}
