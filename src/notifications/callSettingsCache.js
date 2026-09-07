// A tiny on-device cache of the signed-in user's call settings, plus their
// per-caller ringtone/vibration overrides (see callerRingtoneService.js).
//
// Why this exists: when the app is fully killed and an incoming-call FCM
// message wakes index.js's background handler, there's no live Firestore
// listener and no React tree - just a headless JS context. AsyncStorage
// still works there (it's a native module bridge call, not something that
// needs React or an active screen), so we mirror the user's call settings
// (and caller overrides) into it every time either changes while the app
// is open, and the background handler reads that mirror instead of trying
// to hit Firestore cold. Two separate keys rather than one combined blob so
// a settings-only save (e.g. toggling global vibration) doesn't need to
// know about or re-serialize the (possibly much larger) overrides map, and
// vice versa.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CALL_SETTINGS, withCallSettingsDefaults } from '../data/callSettingsConstants';
import { resolveCallerCallSettings } from '../firebase/callerRingtoneService';

const CACHE_KEY = 'mysheba:callSettingsCache';
const CALLER_RINGTONES_CACHE_KEY = 'mysheba:callerRingtonesCache';

export async function cacheCallSettings(settings) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(withCallSettingsDefaults(settings)));
  } catch (e) {
    // Best-effort - worst case the background handler falls back to defaults.
  }
}

export async function readCachedCallSettings() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_CALL_SETTINGS;
    return withCallSettingsDefaults(JSON.parse(raw));
  } catch (e) {
    return DEFAULT_CALL_SETTINGS;
  }
}

/** Mirrors the { [callerUid]: patch } map from subscribeCallerRingtones
 * (AppContext) so the background handler can resolve per-caller overrides
 * without Firestore. Safe to call with an empty object (a user with no
 * overrides yet) - readCachedCallerRingtones below treats a missing/empty
 * cache the same as "no overrides", not an error. */
export async function cacheCallerRingtones(callerRingtones) {
  try {
    await AsyncStorage.setItem(CALLER_RINGTONES_CACHE_KEY, JSON.stringify(callerRingtones || {}));
  } catch (e) {
    // Best-effort - worst case the background handler falls back to the global settings for every caller.
  }
}

export async function readCachedCallerRingtones() {
  try {
    const raw = await AsyncStorage.getItem(CALLER_RINGTONES_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}

/** Convenience for callers (callPush.js) that just want "the effective
 * settings for this one incoming call" without separately reading and
 * merging both caches themselves. `overrideKey` is whichever id the
 * override map is keyed by for this call - the caller's uid for a 1:1
 * call, or the group's id for a group call (see the ringOne comment in
 * functions/index.js and the matching overrideKey logic in
 * IncomingCallModal.js - both must pick the same key for a given call so
 * foreground and background resolve it identically). */
export async function readCachedCallSettingsForCaller(overrideKey) {
  const [settings, callerRingtones] = await Promise.all([
    readCachedCallSettings(),
    readCachedCallerRingtones(),
  ]);
  return resolveCallerCallSettings(settings, callerRingtones, overrideKey);
}

export async function clearCachedCallSettings() {
  try {
    await AsyncStorage.multiRemove([CACHE_KEY, CALLER_RINGTONES_CACHE_KEY]);
  } catch (e) {
    // Ignore - stale cache just means the next login's cache write overwrites it.
  }
}
