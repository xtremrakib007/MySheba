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
  // When the device check was deferred, the local session id is whatever an
  // earlier login left behind - it was never refreshed, because the sign-in
  // that should have refreshed it could not reach checkDeviceSession. A
  // "no" from the server about that id therefore says nothing about this
  // device, and the reasoning below for a missing id applies just as much
  // to a stale one: the person has already passed PIN or biometric here.
  const deferred = await isDeviceCheckDeferred().catch(() => false);
  if (!sessionId) {
    // No session id, because the sign-in that should have created one could
    // not reach checkDeviceSession and was let through anyway. Returning
    // false here would sign the user out at the lock screen and hand them a
    // login screen that is just as likely to be unable to reach the server -
    // turning a degraded state into the lockout that failing open exists to
    // avoid. They have just passed the PIN or biometric on this device, so
    // let the unlock through; the next sign-in re-runs the real check.
    return deferred;
  }
  const fn = httpsCallable(functions, 'validateActiveSession');
  try {
    const { data } = await fn({ deviceId, sessionId });
    if (data?.valid === true) return true;
    return deferred;
  } catch (error) {
    const code = String(error?.code || '');
    if (['functions/failed-precondition', 'functions/permission-denied', 'functions/not-found', 'functions/unauthenticated'].includes(code)) return deferred;
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