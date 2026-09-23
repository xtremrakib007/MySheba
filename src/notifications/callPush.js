// Full-screen "incoming call" notification for Android — the piece that
// makes calls ring like WhatsApp even when the app is backgrounded or fully
// killed.
//
// How this fits with the rest of the call stack:
//   - App OPEN: src/firebase/callService.js's Firestore listener sets
//     `incomingCall` in AppContext directly, and IncomingCallModal.js shows
//     the ringing UI + ringtone. This file is not involved.
//   - App BACKGROUNDED/KILLED: Firestore listeners aren't running, so
//     nothing in JS would normally notice the call. Instead, the
//     `onCallCreated` Cloud Function (functions/index.js) sends a data-only
//     FCM message straight to this device's native FCM token (see
//     pushService.js — separate from the Expo push token used for every
//     other notification). @react-native-firebase/messaging wakes the app's
//     JS in the background just long enough to run
//     setBackgroundMessageHandler (registered in index.js), which calls
//     displayIncomingCallNotification() below.
//   - Tapping/launching that notification opens the app's normal launch
//     activity. No special deep-link code is needed: callService.js's
//     Firestore listener starts as soon as auth is ready and picks the same
//     still-ringing `calls/{id}` doc back up, so IncomingCallModal appears
//     automatically — same code path as the app-open case.
//
// Requires a custom EAS build (already the case for this project via
// expo-dev-client) — Notifee and RNFirebase are native modules, not
// available in plain Expo Go.
import { Platform } from 'react-native';
import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native';
import { VIBRATION_PATTERNS, BACKGROUND_RINGTONE_KEYS, BACKGROUND_RINGTONE_RESOURCE, callChannelId } from '../data/callSettingsConstants';
import { readCachedCallSettings, readCachedCallSettingsForCaller } from './callSettingsCache';

// One fixed channel per (background-capable ringtone) x (vibration
// pattern) combination - e.g. 'calls-default-default', 'calls-soft-long',
// etc, built by callChannelId(). This is the actual mechanism behind
// per-caller ringtones/vibration in the background/killed case: Android
// locks a channel's sound + vibration in at creation time (can't be
// edited after the fact, no per-notification override), so there's no way
// to have ONE channel dynamically play a different sound per caller.
// Instead every possible combination gets its own channel up front, and
// displayIncomingCallNotification picks which channel a given call's
// notification posts to based on that specific caller's resolved settings
// (global, or their per-caller override - see callerRingtoneService.js).
// 'custom' can never appear here since it's excluded from
// BACKGROUND_RINGTONE_KEYS - see the RINGTONE_OPTIONS comment in
// callSettingsConstants.js for why that's a hard platform limit, not an
// oversight.
//
// The matrix is intentionally small and fixed (ringtone options x
// vibration presets, not x contacts) - it does NOT grow per contact the
// user assigns a ringtone to; N contacts sharing the same (ringtone,
// vibration) pair all route to the same one channel.

/** Creates (or leaves alone, if unchanged) every channel in the fixed
 * matrix described above. Notifee no-ops per-channel if it already exists
 * unchanged, so this is safe/cheap to call on every app start and every
 * incoming call. Unlike the old single-channel version, a vibration-only
 * preference change does NOT require rebuilding anything here - the
 * channel for the new (ringtone, vibration) combination already exists
 * (it was created up front), displayIncomingCallNotification just starts
 * pointing new calls at a different existing channel id. rebuildAllCallChannels
 * below exists only for the rare case for the "delete + recreate" pattern
 * to still be available if a channel's definition itself ever needs to
 * change (e.g. adding a new vibration preset later). */
export async function ensureCallChannels() {
  if (Platform.OS !== 'android') return;
  await Promise.all(
    BACKGROUND_RINGTONE_KEYS.flatMap((ringtoneKey) =>
      Object.keys(VIBRATION_PATTERNS).map((vibKey) => {
        const preset = VIBRATION_PATTERNS[vibKey];
        return notifee.createChannel({
          id: callChannelId(ringtoneKey, vibKey),
          name: `Incoming calls (${ringtoneKey === 'soft' ? 'Soft' : 'Default'} · ${preset.label})`,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          // expects android/app/src/main/res/raw/{ringtone,soft}.mp3 —
          // both registered via app.json's expo-notifications "sounds"
          // entry, see setup note in README. BACKGROUND_RINGTONE_RESOURCE
          // maps the ringtone KEY ('default') to the actual raw resource
          // NAME ('ringtone') - they're not the same string, see that
          // constant's comment in callSettingsConstants.js.
          sound: BACKGROUND_RINGTONE_RESOURCE[ringtoneKey],
          vibration: true,
          vibrationPattern: preset.pattern,
        });
      })
    )
  );
}

/** Deletes and recreates every channel in the matrix. Not called on a
 * normal settings save any more (see ensureCallChannels above - the
 * channel for any given combination already exists, nothing to rebuild)
 * - kept for the case where a channel's own definition changes (e.g. a
 * new/edited vibration preset ships in an update) and old installs need
 * their stale channels replaced. */
export async function rebuildAllCallChannels() {
  if (Platform.OS !== 'android') return;
  await Promise.all(
    BACKGROUND_RINGTONE_KEYS.flatMap((ringtoneKey) =>
      Object.keys(VIBRATION_PATTERNS).map(async (vibKey) => {
        try {
          await notifee.deleteChannel(callChannelId(ringtoneKey, vibKey));
        } catch (e) {
          // No-op if it didn't exist yet.
        }
      })
    )
  );
  await ensureCallChannels();
}

/**
 * Shows the full-screen ringing notification for one incoming call.
 * `data` is the FCM data payload sent from onCallCreated: expects
 * { callId, callerName, type, callerUid?, groupId? }. callerUid (1:1 calls)
 * and groupId (group calls) were added alongside callerName specifically
 * so this file can resolve a per-caller/per-group override the same way
 * IncomingCallModal.js's overrideKey does for the foreground case - see
 * that component for the canonical "which key applies" logic this
 * mirrors. Both may be absent on a stale/older client's payload;
 * resolveCallerCallSettings treats a missing key as "no override, use
 * global settings", so this degrades to the pre-per-caller behavior
 * rather than failing.
 */
export async function displayIncomingCallNotification(data) {
  if (Platform.OS !== 'android') return;
  if (!data?.callId) return;

  // Belt-and-braces alongside the server-side check in
  // functions/index.js (sendCallDataMessage) - that one is the real gate
  // since it stops the FCM message being sent at all, but checking again
  // here covers the rare case of a message that was already in flight when
  // the setting changed. Global notificationsEnabled only - a per-caller
  // override never controls whether notifications fire at all, only how
  // they ring (see callerRingtoneService.js file header).
  const settings = await readCachedCallSettings();
  if (settings.notificationsEnabled === false) return;

  // A group call carries groupId (and no callerUid - see the ringOne
  // comment in functions/index.js); a 1:1 call carries callerUid (and no
  // groupId). Exactly one of the two is ever set, so this picks whichever
  // is present - same effective logic as IncomingCallModal.js's
  // isGroup-driven overrideKey, just derived from which field showed up
  // on the payload instead of an isGroup flag.
  const overrideKey = data.groupId || data.callerUid;
  const effective = await readCachedCallSettingsForCaller(overrideKey);
  const channelId = effective.vibrationEnabled === false
    // Vibration off is a per-device toggle, not per-caller (there's no UI
    // for it in RingtonePickerScreen) - route to the 'default' vibration
    // preset's channel with vibration disabled at the notification level
    // below instead of needing a 10th "no vibration" channel per ringtone.
    ? callChannelId(effective.ringtone, 'default')
    : callChannelId(effective.ringtone, effective.vibrationPattern);

  await ensureCallChannels();

  await notifee.displayNotification({
    id: `call-${data.callId}`,
    title: data.callType === 'video' ? '📹 Incoming video call' : '📞 Incoming call',
    body: data.callerName || 'Someone is calling you',
    data,
    android: {
      channelId,
      category: notifee.AndroidCategory ? notifee.AndroidCategory.CALL : 'call',
      importance: AndroidImportance.HIGH,
      loopSound: true,
      vibrationPattern: effective.vibrationEnabled === false ? [] : undefined,
      // This is the actual "ring over the lock screen" behavior — Android
      // launches the given activity full-screen instead of just posting a
      // heads-up banner, the same mechanism WhatsApp/Messenger use.
      fullScreenAction: {
        id: 'default',
      },
      pressAction: {
        id: 'default',
      },
      autoCancel: false,
      ongoing: true,
      timeoutAfter: 45000, // matches RING_TIMEOUT_MS in callService.js
    },
  });
}

/** Clears a call's notification once it's answered/declined/missed elsewhere (e.g. the caller hung up before this device answered). */
export async function cancelIncomingCallNotification(callId) {
  if (Platform.OS !== 'android' || !callId) return;
  await notifee.cancelNotification(`call-${callId}`);
}

/** Registers the foreground tap/dismiss handler — call once near app startup (e.g. in App.js) so tapping the notification while the app happens to already be open behaves the same as elsewhere. */
export function registerCallNotificationForegroundHandler() {
  return notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS && detail.notification?.data?.callId) {
      // No navigation needed — see the file header note: the existing
      // Firestore listener in callService.js already surfaces this same
      // ringing call as soon as the app is in the foreground.
    }
  });
}
