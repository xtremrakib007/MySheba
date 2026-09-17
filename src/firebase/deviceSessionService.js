// Client half of single-device-login support - persists a random,
// per-install device id and the session id this device last confirmed as
// active, both in AsyncStorage. The server treats deviceId as an opaque
// install identifier; it is not an authentication credential by itself.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const DEVICE_ID_KEY = 'mysheba_device_id';
const LOCAL_SESSION_ID_KEY = 'mysheba_local_session_id';

function generateId() {
  // expo-crypto UUID generation uses the platform crypto implementation,
  // avoiding Math.random() for an identifier that is used throughout the
  // single-device/trusted-device security flow.
  if (typeof Crypto.randomUUID === 'function') return Crypto.randomUUID();
  // SDK fallback for environments where randomUUID is unavailable.
  return `${Crypto.getRandomBytes(4).map((b) => b.toString(16).padStart(2, '0')).join('')}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
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

/** A short human-readable label for THIS device. This is cosmetic metadata only. */
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

/** Lists this account's trusted staff devices. Server authorization is authoritative. */
export async function listTrustedDevices() {
  const currentDeviceId = await getDeviceId();
  const fn = httpsCallable(functions, 'listTrustedDevices');
  const { data } = await fn({ currentDeviceId });
  return data.devices || [];
}

/** Revokes one trusted device from Settings > Trusted Devices. */
export async function revokeTrustedDevice(deviceId) {
  const fn = httpsCallable(functions, 'revokeTrustedDevice');
  await fn({ deviceId });
}
