// Dynamic Expo config. Firebase and AdMob values can be injected by EAS
// environment variables without committing secrets or provider settings.
const appJson = require('./app.base.json');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || appJson.expo.extra.googleMapsApiKey;
const ADMOB_ANDROID_BANNER_ID = process.env.ADMOB_ANDROID_BANNER_ID || appJson.expo.extra.admobAndroidBannerId;
const ADMOB_IOS_BANNER_ID = process.env.ADMOB_IOS_BANNER_ID || appJson.expo.extra.admobIosBannerId;
const ADMOB_ANDROID_INTERSTITIAL_ID = process.env.ADMOB_ANDROID_INTERSTITIAL_ID || appJson.expo.extra.admobAndroidInterstitialId;

module.exports = () => {
  const expo = appJson.expo;
  return {
    ...expo,
    plugins: [
      ...(expo.plugins || []),
      '@nitro-mlkit/face-recognition',
    ],
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
      admobAndroidBannerId: ADMOB_ANDROID_BANNER_ID,
      admobIosBannerId: ADMOB_IOS_BANNER_ID,
      admobAndroidInterstitialId: ADMOB_ANDROID_INTERSTITIAL_ID,
    },
  };
};
