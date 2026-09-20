// Dynamic Expo config. Firebase and AdMob values can be injected by EAS
// environment variables without committing secrets or provider settings.
const appJson = require('./app.base.json');

const ADMOB_ANDROID_BANNER_ID = process.env.ADMOB_ANDROID_BANNER_ID || appJson.expo.extra.admobAndroidBannerId;
const ADMOB_IOS_BANNER_ID = process.env.ADMOB_IOS_BANNER_ID || appJson.expo.extra.admobIosBannerId;
const ADMOB_ANDROID_INTERSTITIAL_ID = process.env.ADMOB_ANDROID_INTERSTITIAL_ID || appJson.expo.extra.admobAndroidInterstitialId;

module.exports = () => {
  const expo = appJson.expo;
  return {
    ...expo,
    android: {
      ...expo.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || expo.android.googleServicesFile,
    },
    extra: {
      ...expo.extra,
      admobAndroidBannerId: ADMOB_ANDROID_BANNER_ID,
      admobIosBannerId: ADMOB_IOS_BANNER_ID,
      admobAndroidInterstitialId: ADMOB_ANDROID_INTERSTITIAL_ID,
    },
  };
};
