// Dynamic Expo config. Firebase and AdMob values can be injected by EAS
// environment variables without committing secrets or provider settings.
const fs = require('fs');
const appJson = require('./app.base.json');

const ADMOB_ANDROID_BANNER_ID =
  process.env.ADMOB_ANDROID_BANNER_ID || appJson.expo.extra.admobAndroidBannerId;
const ADMOB_IOS_BANNER_ID =
  process.env.ADMOB_IOS_BANNER_ID || appJson.expo.extra.admobIosBannerId;
const ADMOB_ANDROID_INTERSTITIAL_ID =
  process.env.ADMOB_ANDROID_INTERSTITIAL_ID ||
  appJson.expo.extra.admobAndroidInterstitialId;

function resolveGoogleServicesFile() {
  const configured = process.env.GOOGLE_SERVICES_JSON || appJson.expo.android.googleServicesFile;

  // EAS file environment variables are materialized as filesystem paths.
  // Never accept raw JSON here: expo expects a path to google-services.json.
  if (process.env.GOOGLE_SERVICES_JSON && !fs.existsSync(process.env.GOOGLE_SERVICES_JSON)) {
    throw new Error(
      'GOOGLE_SERVICES_JSON is set but does not point to a readable google-services.json file.'
    );
  }

  // A standalone EAS build must have Firebase's native Android configuration.
  // Local development may still use the gitignored ./google-services.json fallback.
  if (process.env.EAS_BUILD && !fs.existsSync(configured)) {
    throw new Error(
      'Production/standalone Android build requires google-services.json. Configure GOOGLE_SERVICES_JSON as an EAS file environment variable.'
    );
  }

  return configured;
}

module.exports = () => {
  const expo = appJson.expo;
  return {
    ...expo,
    android: {
      ...expo.android,
      googleServicesFile: resolveGoogleServicesFile(),
    },
    extra: {
      ...expo.extra,
      admobAndroidBannerId: ADMOB_ANDROID_BANNER_ID,
      admobIosBannerId: ADMOB_IOS_BANNER_ID,
      admobAndroidInterstitialId: ADMOB_ANDROID_INTERSTITIAL_ID,
    },
  };
};
