import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const DEVICE_ID_KEY = 'mysheba_device_id';
const LOCAL_SESSION_ID_KEY = 'mysheba_local_session_id';

function bytesToHex(bytes) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function generateId() {
  const bytes = Crypto.getRandomBytes(16);
  const chars = bytesToHex(bytes).split('');
  chars[12] = '4';
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  return `${chars.slice(0, 8).join('')}-${chars.slice(8, 12).join('')}-${chars.slice(12, 16).join('')}-${chars.slice(16, 20).join('')}-${chars.slice(20).join('')}`;
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

export async function getSessionProof() {
  const [sessionId, deviceId] = await Promise.all([getLocalSessionId(), getDeviceId()]);
  if (!sessionId || !deviceId) throw new Error('Your secure session is missing. Please sign in again.');
  return { sessionId, deviceId };
}

export async function setLocalSessionId(sessionId) {
  if (!sessionId) return;
  await AsyncStorage.setItem(LOCAL_SESSION_ID_KEY, sessionId);
}

export async function clearLocalSessionId() {
  await AsyncStorage.removeItem(LOCAL_SESSION_ID_KEY);
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

// AppLockScreen awaits this before letting an unlock through. The client
// half went missing while the callable stayed deployed, so the call
// resolved to undefined and threw a TypeError the moment someone tried to
// unlock - not a failed check, a crash.
//
// The server throws rather than returning false when the session is no
// longer the active one, so those cases are caught and reported as invalid;
// anything else is re-thrown, since a network blip should not silently read
// as "this session is fine".
export async function validateActiveSession() {
  const deviceId = await getDeviceId();
  const sessionId = await getLocalSessionId();
  if (!sessionId) return false;
  const fn = httpsCallable(functions, 'validateActiveSession');
  try {
    const { data } = await fn({ deviceId, sessionId });
    return data?.valid === true;
  } catch (error) {
    const code = String(error?.code || '');
    if (['functions/failed-precondition', 'functions/permission-denied', 'functions/not-found', 'functions/unauthenticated'].includes(code)) return false;
    throw error;
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
  const { data } = await fn({ deviceId });
  return data || {};
}