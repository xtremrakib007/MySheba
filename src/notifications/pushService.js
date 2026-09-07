// Push notification registration for MySheba.
//
// This file only handles the CLIENT half of push notifications: asking for
// permission, getting an Expo push token, and saving it to the user's
// Firestore profile (users/{uid}.pushToken). The SERVER half - actually
// sending a notification when a transaction/topup/inquiry changes status -
// lives in /functions (Cloud Functions), which reads that same token back
// out and calls Expo's push API. See functions/README.md for deploy steps;
// nothing here can send a push by itself.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import messaging from '@react-native-firebase/messaging';

// Foreground behavior: show an in-app banner + play the default sound even
// while the app is open, instead of silently queuing it.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests permission and returns an Expo push token for this device, or
 * null if permission was denied or this isn't a physical device (push
 * tokens don't work in the simulator/emulator).
 */
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    // Simulators/emulators can't receive real pushes - fail quietly rather
    // than throwing, so this is safe to call unconditionally on app start.
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1A73E8',
    });

    // Separate, MAX-importance channel just for incoming calls. Android
    // treats channels independently of app state: a MAX-importance
    // notification pops up as a heads-up banner with sound + vibration even
    // while the app is fully closed, which the 'default' channel above
    // (DEFAULT importance) won't do. This is the free/no-native-rebuild
    // ceiling for "ring when the app isn't open" - a true full-screen
    // lock-screen incoming-call UI needs CallKeep/ConnectionService, which
    // needs a custom EAS build. See functions/index.js (onCallCreated),
    // which sends call pushes with channelId: 'calls' so they land here.
    await Notifications.setNotificationChannelAsync('calls', {
      name: 'Incoming calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 700, 400, 700, 400, 700],
      lightColor: '#1A73E8',
      sound: 'default',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    return null;
  }

  // Needed so Expo's push service knows which project to route the token
  // through - set this in app.json (extra.eas.projectId) after running
  // `eas init` on your own EAS account.
  const rawProjectId =
    Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
  // app.json ships with a literal placeholder value ("REPLACE_WITH_..."),
  // which is truthy, so the old check here (`if (projectId)`) would still
  // pass it straight to Expo and let getExpoPushTokenAsync() fail with an
  // opaque network/400 error that's easy to miss in device logs - this is
  // the #1 reason "notifications don't arrive at all" in practice, since
  // nothing else about the app looks broken. Fail loudly and specifically
  // instead, once per app run, so it's obvious what to fix.
  const projectId = rawProjectId && !String(rawProjectId).startsWith('REPLACE_WITH') ? rawProjectId : null;
  if (!projectId) {
    console.warn(
      'Push notifications disabled: app.json extra.eas.projectId is missing or still the ' +
        'placeholder value. Run `eas init` (see functions/README.md, step 1) and put the real ' +
        'project ID in app.json, then rebuild. No push token will be saved until this is fixed.'
    );
    return null;
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenResponse.data;
  } catch (e) {
    // Missing/placeholder projectId, offline, etc. - don't crash the app
    // over a notification token; the rest of MySheba works fine without it.
    console.warn('Push token registration failed:', e.message);
    return null;
  }
}

/**
 * Returns this device's raw FCM registration token, or null.
 *
 * Separate from registerForPushNotificationsAsync() above on purpose: that
 * one returns an Expo push token (routed through Expo's push service, fine
 * for ordinary notifications). Incoming-call pushes need to reach this
 * device as a *data-only* message so the RNFirebase background handler in
 * index.js can fire and show a Notifee full-screen call notification even
 * with the app killed — Expo's push API doesn't reliably support that, so
 * calls go over this raw FCM token instead (see functions/index.js,
 * onCallCreated). Requires the native Firebase config
 * (google-services.json) to be present in the build; returns null if
 * messaging() isn't available (e.g. missing config, unsupported platform).
 */
export async function getFcmToken() {
  if (Platform.OS !== 'android' || !Device.isDevice) return null;
  try {
    await messaging().requestPermission();
    return await messaging().getToken();
  } catch (e) {
    console.warn('FCM token registration failed (call notifications will fall back to the quieter push):', e.message);
    return null;
  }
}

/** Adds a listener that fires when a notification arrives while the app is foregrounded. */
export function addNotificationReceivedListener(handler) {
  return Notifications.addNotificationReceivedListener(handler);
}

/** Adds a listener that fires when the user taps a notification while the app is foregrounded or backgrounded. Does NOT fire for the tap that cold-launches the app from a killed state - use getLastNotificationResponseAsync for that case. */
export function addNotificationResponseListener(handler) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

/** One-time check for the notification response (if any) that cold-launched the app - call this once on startup alongside addNotificationResponseListener, since the listener alone misses this case. Returns null if the app wasn't opened by tapping a notification. */
export async function getLastNotificationResponseAsync() {
  return Notifications.getLastNotificationResponseAsync();
}
