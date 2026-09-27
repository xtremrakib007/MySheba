import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const DEVICE_ID_KEY = 'mysheba_device_id';
const LOCAL_SESSION_ID_KEY = 'mysheba_local_session_id';
// Set when checkDeviceSession could not be reached during sign-in and the
// user was let through anyway. It means "this device has not been checked
// yet", not "this device is trusted", and it is cleared the moment a check
// does complete.
const DEVICE_CHECK_DEFERRED_KEY = 'mysheba_device_check_deferred';

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

export async function setDeviceCheckDeferred() {
  await AsyncStorage.setItem(DEVICE_CHECK_DEFERRED_KEY, '1').catch(() => {});
}

export async function isDeviceCheckDeferred() {
  try {
    return (await AsyncStorage.getItem(DEVICE_CHECK_DEFERRED_KEY)) === '1';
  } catch (_) {
    return false;
  }
}

export async function clearDeviceCheckDeferred() {
  await AsyncStorage.removeItem(DEVICE_CHECK_DEFERRED_KEY).catch(() => {});
}

// A callable failure that means "no answer", as opposed to an answer of no.
//
// The distinction is the whole point of failing open: "this device needs
// verifying" is the feature working and must block, while "the function
// could not be reached" is an outage and must not. functions/unauthenticated
// belongs in this list because the framework returns it when the callable
// itself is misconfigured - App Check enforced against a client that sends
// no App Check token, which is exactly what locked every user out of this
// app between 2026-09-16 and 2026-09-26. The user's own credentials were
// already accepted by Firebase Auth moments earlier, so it cannot mean
// their sign-in was invalid.
const UNREACHABLE_CODES = [
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/internal',
  'functions/cancelled',
  'functions/unauthenticated',
  'functions/aborted',
];

export function isDeviceCheckUnreachable(error) {
  const code = String(error?.code || '').toLowerCase();
  if (UNREACHABLE_CODES.includes(code)) return true;
  const raw = `${code} ${String(error?.message || '')}`.toLowerCase();
  return ['network', 'failed to fetch', 'timeout', 'timed out'].some((h) => raw.includes(h));
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

// validateActiveSession lived here, and AppLockScreen called it before
// letting an unlock through. It no longer does: unlocking must never sign
// anyone out, and a server round-trip at unlock time also made the lock
// unopenable offline. Single-device enforcement runs at sign-in
// (checkDeviceSession) and on every live profile update while the app is
// open (shouldEndSessionForDevice), which is where it belongs.
//
// The callable itself is still deployed and unchanged; nothing in the app
// calls it now.

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