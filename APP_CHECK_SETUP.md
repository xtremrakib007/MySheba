# MySheba App Check setup

MySheba now sends Firebase App Check tokens from the native Android/iOS attestation layer into the Firebase JavaScript SDK used by the mobile app. Sensitive callable functions enforce App Check in addition to Firebase Auth, role checks, session checks and rate limits.

## Firebase Console

1. Open Firebase Console → **App Check** for the `satulink-solutions` project.
2. Register the Android app `com.satulink.mysheba`.
3. Configure **Play Integrity** for the production Android app.
4. Register the production Android SHA-256 certificate fingerprints used by the Play-distributed build.
5. For iOS, register the app and configure **App Attest** with DeviceCheck fallback when applicable.
6. Monitor App Check metrics before enabling any additional product-wide enforcement.

## Development / preview APKs

Play Integrity is intended for the production Play-distributed app. For a development or internal preview APK, create a Firebase App Check debug token and add it as an EAS environment variable named:

`FIREBASE_APP_CHECK_DEBUG_TOKEN`

The Expo dynamic config passes that value only into the build that requested it. The app then selects the App Check debug provider for that build.

Do **not** commit the debug token to Git.

## Production

Production builds without the debug-token environment variable use:

- Android: Play Integrity
- iOS: App Attest with DeviceCheck fallback

App Check must be initialized before Firebase callable functions are used. The client bridge is in `src/firebase/config.js`.

## Secret Manager

API provider credentials are stored in Google Secret Manager. The Functions runtime service account must have the required Secret Manager permissions before a provider is saved or the one-time migration callable is run.

See `API_PROVIDER_MANAGEMENT.md` for the provider-secret migration details.
