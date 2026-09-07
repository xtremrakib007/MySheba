// Biometric unlock for App Lock (AppLockScreen.js). Wraps
// expo-local-authentication, which talks to whatever the device already
// has enrolled - Android fingerprint, Android face unlock, iOS Face
// ID/Touch ID - without MySheba ever seeing the biometric data itself
// (that never leaves the OS's secure hardware). There's nothing to store
// or manage here: unlike the PIN, there's no server-side "biometric
// secret" - the OS enrollment already exists at the device level, this
// just asks it to prompt.
import * as LocalAuthentication from 'expo-local-authentication';

/** True if the device has biometric hardware AND has something enrolled
 * (a fingerprint/face registered in the OS) - both are required, since
 * hardware without enrollment can't actually prompt. */
export async function isBiometricAvailable() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return isEnrolled;
  } catch (e) {
    return false;
  }
}

/** Prompts the OS biometric UI. Resolves true on success, false on
 * cancel/failure/no biometrics - never throws, so callers can just
 * branch on the boolean without a try/catch. */
export async function authenticateWithBiometric(promptMessage) {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || 'Unlock MySheba',
      cancelLabel: 'Use PIN instead',
      disableDeviceFallback: true, // stay on our own PIN, not the phone's lock-screen PIN
    });
    return !!result.success;
  } catch (e) {
    return false;
  }
}
