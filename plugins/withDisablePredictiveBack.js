const { withAndroidManifest } = require('@expo/config-plugins');

// Keeps Android's Back button working on Android 16.
//
// MySheba targets SDK 36. On an Android 16 phone that turns on "predictive
// back" by default, and Android then never calls Activity.onBackPressed() -
// which is the only way React Native 0.79 delivers 'hardwareBackPress' to
// JavaScript. AppContext's back handling (close the sidebar, step back a
// wizard step or screen, go Home, "Press back again to exit") never ran, and
// the system simply closed the app on the first press. Older Android versions
// still call onBackPressed(), which is why only some phones were affected.
//
// android:enableOnBackInvokedCallback="false" opts the app out, restoring
// onBackPressed() on every Android version. Needs a new native build; an OTA
// update cannot change the manifest.
module.exports = function withDisablePredictiveBack(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$ = { ...application.$, 'android:enableOnBackInvokedCallback': 'false' };
      for (const activity of application.activity || []) {
        activity.$ = { ...activity.$, 'android:enableOnBackInvokedCallback': 'false' };
      }
    }
    return config;
  });
};
