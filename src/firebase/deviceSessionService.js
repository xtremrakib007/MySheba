import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './config';

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

// One in-flight read, shared by every caller.
//
// This used to be a bare read-then-write, and on a device with nothing
// stored yet - a fresh install, a reinstall, cleared app data - two callers
// arriving together both saw null, both generated an id, and both wrote.
// Last write won, so one of them walked away with an id no one else agreed
// with. Sign-in sent that id to the server, which recorded it as the active
// device; the profile listener then read the stored one and saw a different
// device, and the single-device rule signed the person out with "your
// account was signed in on another device". One phone, nobody else involved.
//
// The device id is now what decides whether a session was taken over, so it
// has to be the same value everywhere. A shared promise gives every caller
// in this runtime one answer, and the re-read after writing settles on
// whatever actually landed in storage.
let deviceIdPromise = null;

export async function getDeviceId() {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (existing) return existing;
      const fresh = generateId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
      const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
      return stored || fresh;
    })();
    // A failed read must not be cached as the answer for the whole session.
    deviceIdPromise.catch(() => { deviceIdPromise = null; });
  }
  return deviceIdPromise;
}

export async function getLocalSessionId() {
  return AsyncStorage.getItem(LOCAL_SESSION_ID_KEY);
}

// Re-establishing a session for a device that is already signed in.
//
// Sign-in deliberately lets people through when checkDeviceSession cannot be
// reached (see authService: App Check enforcement once locked out every user
// for ten days, so availability wins). It sets the deferred flag and stores no
// local session id.
//
// Nothing ever did the other half. Twenty call sites ask for session proof
// before touching money, and with no local session id every one of them failed
// with "Your secure session is missing. Please sign in again." - permanently,
// because signing in again while the check is still unreachable lands in the
// same state, and the person has no reason to try: they ARE signed in.
//
// So the proof is repaired on demand, through the same callable sign-in uses.
// This grants nothing: the server still decides. If it wants the device
// verified it says so and we stop, and whatever it returns is validated again
// on every callable against the profile's activeSessionId and activeDeviceId.
let repairPromise = null;

export async function repairSessionProof() {
  if (!repairPromise) {
    repairPromise = (async () => {
      if (!auth.currentUser) throw new Error('Your secure session is missing. Please sign in again.');
      const deviceId = await getDeviceId();
      const sessionFn = httpsCallable(functions, 'checkDeviceSession');
      const { data } = await sessionFn({ deviceId, deviceLabel: getDeviceLabel() });
      if (data?.requiresOtp) {
        throw new Error('This device needs to be verified before you can continue. Please sign out and sign in again to verify it.');
      }
      if (!data?.sessionId) throw new Error('Your secure session is missing. Please sign in again.');
      await setLocalSessionId(data.sessionId);
      // A check that completed is exactly what clears the deferred flag.
      await clearDeviceCheckDeferred();
      return data.sessionId;
    })();
    // A failed repair must not be cached as the answer for the whole session;
    // the next attempt should be able to try again.
    repairPromise.catch(() => { repairPromise = null; });
  }
  return repairPromise;
}

export async function getSessionProof() {
  const [sessionId, deviceId] = await Promise.all([getLocalSessionId(), getDeviceId()]);
  if (sessionId && deviceId) return { sessionId, deviceId };
  const repaired = await repairSessionProof();
  return { sessionId: repaired, deviceId: deviceId || (await getDeviceId()) };
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