// Wraps app.json in a dynamic config so the Android google-services.json
// path can come from an EAS secret at build time.
//
// Why this file exists: google-services.json is (correctly) gitignored,
// but EAS Build only uploads files tracked by git, so the build server
// never sees it — even though it's sitting right there locally. The fix
// Expo recommends is a file-type EAS environment variable named
// GOOGLE_SERVICES_JSON (see CALL_NOTIFICATION_SETUP.md / eas env:create).
// EAS Build makes that available as a real file path in process.env at
// build time; locally (or if the secret isn't set) it falls back to the
// plain ./google-services.json path exactly as before.
const appJson = require('./app.base.json');

// Google Maps API key: same "gitignored locally, injected at build time"
// pattern as GOOGLE_SERVICES_JSON above. Set it as a plain env var for
// local `expo start`/`expo run:android` (e.g. in a .env file loaded by
// your shell, or `GOOGLE_MAPS_API_KEY=xxx npx expo run:android`), and as
// an EAS secret (`eas env:create --name GOOGLE_MAPS_API_KEY --value ...`)
// for EAS Build. See GOOGLE_MAPS_SETUP.md for the full checklist (which
// Google Cloud APIs to enable, key restrictions, etc).
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || appJson.expo.extra.googleMapsApiKey;

module.exports = () => {
  const expo = appJson.expo;
  return {
    ...expo,
    android: {
      ...expo.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || expo.android.googleServicesFile,
      config: {
        ...expo.android.config,
        googleMaps: { apiKey: GOOGLE_MAPS_API_KEY },
      },
    },
    ios: {
      ...expo.ios,
      config: {
        ...expo.ios.config,
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      },
    },
    extra: {
      ...expo.extra,
      googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    },
  };
};
