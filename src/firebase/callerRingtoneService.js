// Per-caller ringtone + vibration overrides - lets a user set "when THIS
// person calls me, ring like this" instead of only the one global Call
// Settings profile (see callSettingsConstants.js / CallSettingsScreen.js).
// Same subcollection shape and same owner-only Firestore rule as the
// friends list (contactsService.js) - one doc per caller, keyed by the
// caller's uid, living at users/{uid}/callerRingtones/{callerUid}.
//
// A saved doc here is a *sparse* patch, not a full callSettings object -
// only 'ringtone' and/or 'vibrationPattern' are ever set (plus
// customRingtoneUri/customRingtoneName when ringtone === 'custom'), never
// 'volume' or 'notificationsEnabled', which stay global-only by design
// (see RingtonePickerScreen.js). Consumers merge this patch over the
// user's own global callSettings - see resolveCallerCallSettings below,
// which IncomingCallModal.js and callSettingsCache.js both use so
// foreground and background resolve a given caller identically.
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { CALLER_RINGTONE_COLLECTION, withCallSettingsDefaults } from '../data/callSettingsConstants';

/** Saves (or replaces) the ringtone/vibration override for one caller.
 * `patch` is whatever subset of { ringtone, customRingtoneUri,
 * customRingtoneName, vibrationPattern } the picker screen changed -
 * merged with setDoc's `merge: true` so changing just the vibration
 * pattern later doesn't clobber a previously-saved ringtone choice.
 * `callerName` is stored purely for display (e.g. a future "manage
 * overrides" list) - never read by the resolve/ring path itself, which
 * always keys off callerUid. */
export async function setCallerRingtone(ownerUid, callerUid, patch, callerName) {
  if (!ownerUid || !callerUid) return;
  await setDoc(
    doc(db, 'users', ownerUid, CALLER_RINGTONE_COLLECTION, callerUid),
    {
      ...patch,
      callerName: callerName || '',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Removes one caller's override entirely, so they fall back to the
 * owner's global Call Settings again. */
export async function removeCallerRingtone(ownerUid, callerUid) {
  if (!ownerUid || !callerUid) return;
  await deleteDoc(doc(db, 'users', ownerUid, CALLER_RINGTONE_COLLECTION, callerUid));
}

/** Live subscription to all of the signed-in user's per-caller overrides,
 * as a plain { [callerUid]: patch } map - the shape AppContext keeps in
 * state and mirrors to AsyncStorage (see callSettingsCache.js) for the
 * background handler to read without a live listener. */
export function subscribeCallerRingtones(ownerUid, onChange) {
  if (!ownerUid) return () => {};
  return onSnapshot(collection(db, 'users', ownerUid, CALLER_RINGTONE_COLLECTION), (snap) => {
    const map = {};
    snap.docs.forEach((d) => {
      map[d.id] = d.data();
    });
    onChange(map);
  });
}

/** Resolves the effective call settings for a specific incoming call:
 * the caller's override (if any) merged over the owner's global
 * callSettings, which is itself already merged over DEFAULT_CALL_SETTINGS.
 * `notificationsEnabled` and `volume` are deliberately never touched by an
 * override (see the file header) - only ringtone/vibration fields can
 * differ per caller. Same function used by IncomingCallModal.js
 * (foreground, reads live state) and callSettingsCache.js's cached read
 * (background), so a given call always resolves the same way regardless
 * of which path is ringing. `overrideKey` is the id the override map is
 * keyed by for THIS call - a 1:1 call's callerUid, or a group call's
 * groupId (a group rings the same way regardless of which member started
 * this particular instance - see IncomingCallModal.js's overrideKey
 * derivation for the canonical logic every caller of this function should
 * mirror). May be null/undefined (e.g. a malformed payload, or a call
 * kind resolveCallerCallSettings' caller hasn't keyed) - falls back to the
 * global settings untouched. */
export function resolveCallerCallSettings(globalSettings, callerRingtones, overrideKey) {
  const base = withCallSettingsDefaults(globalSettings);
  const override = overrideKey && callerRingtones ? callerRingtones[overrideKey] : null;
  if (!override) return base;
  const { ringtone, customRingtoneUri, customRingtoneName, vibrationPattern } = override;
  return {
    ...base,
    ...(ringtone ? { ringtone, customRingtoneUri: customRingtoneUri || null, customRingtoneName: customRingtoneName || null } : {}),
    ...(vibrationPattern ? { vibrationPattern } : {}),
  };
}
