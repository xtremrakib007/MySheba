// Client half of single-device-login support - persists a random,
// per-install device id and the session id this device last confirmed as
// active, both in AsyncStorage (same pattern as firebase/config.js /
// LoginScreen.js). AppContext.js's profile subscription reads both on
// every live profile update to decide whether this device has been
// displaced by a newer login elsewhere (see the "Single-device-login
// enforcement" block there) or is itself mid-verification.
//
// Also home to the client half of Trusted Devices (admin/superadmin
// skip-OTP devices - see functions/deviceSessionService.js's own doc
// comment for the full flow): getDeviceLabel() below is sent alongside
// deviceId on every checkDeviceSession call (see authService.js) purely
// as a cosmetic label for Settings > Trusted Devices; listTrustedDevices/
// revokeTrustedDevice just wrap the matching Cloud Functions.
//
// Server half: functions/deviceSessionService.js (checkDeviceSession /
// confirmDeviceSwitch / clearActiveSession / listTrustedDevices /
// revokeTrustedDevice), called from src/firebase/authService.js's
// login/signInWithGoogle/confirmDeviceLogin/logout and
// TrustedDevicesScreen.js. That's what actually stamps
// users/{uid}.activeSessionId/trustedDevices - this file only ever reads/
// writes the local AsyncStorage copies of the session ids, plus thin
// wrappers around the trusted-device callables.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const DEVICE_ID_KEY = 'mysheba_device_id';
const LOCAL_SESSION_ID_KEY = 'mysheba_local_session_id';

function generateId() {
  // Device IDs are security-relevant because the server uses them to bind
  // the single-device session and trusted-device records. Do not use
  // Math.random(): it is not intended for security-sensitive identifiers.
  if (typeof Crypto.randomUUID === 'function') return Crypto.randomUUID();
  throw new Error('Secure device ID generation is unavailable.');
}

/** Returns this install's device id, generating and persisting one on first call. */
export async function getDeviceId() {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Returns the session id this device last saved after a successful login/verification, or null if none yet. */
export async function getLocalSessionId() {
  return AsyncStorage.getItem(LOCAL_SESSION_ID_KEY);
}

/** Saves the session id this device just became active with - call after a successful login, Google sign-in, or device verification. */
export async function setLocalSessionId(sessionId) {
  if (!sessionId) return;
  await AsyncStorage.setItem(LOCAL_SESSION_ID_KEY, sessionId);
}

/** Clears the locally-saved session id, e.g. on logout or when this device is displaced by another. */
export async function clearLocalSessionId() {
  await AsyncStorage.removeItem(LOCAL_SESSION_ID_KEY);
}

/** A short human-readable label for THIS device ("iPhone 14 Pro, iOS 17"),
 * sent alongside deviceId on every checkDeviceSession call so Settings >
 * Trusted Devices can show something recognizable instead of a bare id.
 * Purely cosmetic - falls back to just the platform name if expo-device
 * can't resolve a model (web, or a rare device that doesn't report one). */
export function getDeviceLabel() {
  try {
    const model = Device.modelName || Device.deviceName;
    const os = Device.osName || (Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS);
    const osVersion = Device.osVersion;
    if (model && osVersion) return `${model}, ${os} ${osVersion}`;
    if (model) return `${model}, ${os}`;
    return os;
  } catch (e) {
    return Platform.OS;
  }
}

/** This account's own trusted (skip-OTP) admin/superadmin devices - powers
 * TrustedDevicesScreen.js. `currentDeviceId` just flags which returned row
 * is this device (see listTrustedDevices in functions/
 * deviceSessionService.js). Always returns an array, even for a non-admin
 * account (which simply has none). */
export async function listTrustedDevices() {
  const currentDeviceId = await getDeviceId();
  const fn = httpsCallable(functions, 'listTrustedDevices');
  const { data } = await fn({ currentDeviceId });
  return data.devices || [];
}

/** Revokes one trusted device from Settings > Trusted Devices - its next
 * login goes through the full email-OTP challenge again. */
export async function revokeTrustedDevice(deviceId) {
  const fn = httpsCallable(functions, 'revokeTrustedDevice');
  await fn({ deviceId });
}
