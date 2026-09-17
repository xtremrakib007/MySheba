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
  if (typeof Crypto.randomUUID !== 'function') {
    throw new Error('Secure device identifier generation is unavailable. Please update the app.');
  }
  return Crypto.randomUUID();
}

export async function getDeviceId() {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export async function getLocalSessionId() {
  return AsyncStorage.getItem(LOCAL_SESSION_ID_KEY);
}

export async function setLocalSessionId(sessionId) {
  if (!sessionId) return;
  await AsyncStorage.setItem(LOCAL_SESSION_ID_KEY, sessionId);
}

export async function clearLocalSessionId() {
  await AsyncStorage.removeItem(LOCAL_SESSION_ID_KEY);
}

export async function validateActiveSession() {
  const deviceId = await getDeviceId();
  const sessionId = await getLocalSessionId();
  if (!sessionId) return false;
  const fn = httpsCallable(functions, 'validateActiveSession');
  try {
    const { data } = await fn({ deviceId, sessionId });
    return data?.valid === true;
  } catch (error) {
    if (error?.code === 'functions/failed-precondition' || error?.code === 'functions/unauthenticated' || error?.code === 'functions/permission-denied' || error?.code === 'functions/not-found') {
      return false;
    }
    throw error;
  }
}

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

export async function listTrustedDevices() {
  const currentDeviceId = await getDeviceId();
  const fn = httpsCallable(functions, 'listTrustedDevices');
  const { data } = await fn({ currentDeviceId });
  return data.devices || [];
}

export async function revokeTrustedDevice(deviceId) {
  const fn = httpsCallable(functions, 'revokeTrustedDevice');
  await fn({ deviceId });
}
