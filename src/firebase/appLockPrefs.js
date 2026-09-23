// Whether App Lock (PIN/biometric gate shown on launch and on returning
// from background - see AppLockScreen.js + AppContext's appLocked state)
// is turned on. This is a per-device convenience setting, not account
// data, so it lives in plain AsyncStorage rather than Firestore or the
// encrypted secureLocalStorage wrapper (a boolean isn't sensitive the way
// an auth token is - see secureLocalStorage.js's own reasoning for that
// distinction). The actual PIN this gate checks against is the account's
// existing security PIN (functions/securityPinService.js, same one that
// protects My Documents/Transfer Points/Notepad) - nothing PIN-related is
// stored here.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'mysheba_app_lock_enabled_v1';

export async function getAppLockEnabled() {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch (e) {
    return false;
  }
}

export async function setAppLockEnabledPref(value) {
  try {
    await AsyncStorage.setItem(KEY, value ? '1' : '0');
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
