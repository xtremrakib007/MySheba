# Setting up full-screen incoming calls (Android)

## 1. Fix background notifications generally (do this first)
`app.json` references `android.googleServicesFile: "./google-services.json"`,
but that file isn't in the project. Without it, Android push doesn't work
at all while the app isn't open — not just calls.

1. Firebase console -> Project settings -> your Android app
   (`com.satulink.mysheba`) -> download `google-services.json` -> put it at
   the project root (next to `app.json`).
2. `eas credentials` -> Android -> Push Notifications -> upload/generate an
   FCM V1 service account key for the `satulink-solutions` project.

## 2. Install the new native deps
```
npm install
npx expo prebuild --clean   # regenerates native android/ios projects with the new plugins
```

## 3. Ringtone file for the native channel
`callPush.js` expects `android/app/src/main/res/raw/ringtone.mp3` (the
notification channel's sound). This is now handled automatically — the
`expo-notifications` plugin in `app.json` has a `sounds` entry pointing at
`assets/sounds/ringtone.mp3`, which copies it into the right native
location every time you run `expo prebuild`. No manual copying needed, and
it survives a clean prebuild (manually copying into `android/` would not,
since that folder is regenerated).

## 4. Rebuild
This requires a new custom dev/EAS build — Notifee and
@react-native-firebase are native modules, not available in Expo Go or an
old cached build:
```
eas build --profile development --platform android
```

## What changed
- `index.js` (new, now the app's `main` entry) — registers the RNFirebase
  background handler so it can run even with the app killed.
- `src/notifications/callPush.js` (new) — creates the Android call channel
  and shows the full-screen-intent notification.
- `src/notifications/pushService.js` — added `getFcmToken()`, a raw FCM
  token separate from the existing Expo push token.
- `src/context/AppContext.js` / `src/firebase/authService.js` — save that
  FCM token onto `users/{uid}.fcmToken`.
- `functions/index.js` (`onCallCreated`) — now also sends a data-only FCM
  message straight to `fcmToken`, alongside the existing Expo push.
- `app.json` — new permissions (`POST_NOTIFICATIONS`,
  `USE_FULL_SCREEN_INTENT`, `WAKE_LOCK`, `VIBRATE`) and the
  `@react-native-firebase/app` / `@notifee/react-native` config plugins.

iOS still gets the existing quieter push (true CallKit/PushKit ringing was
scoped out — see prior conversation if you want that added later).
