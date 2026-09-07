const { withAndroidManifest } = require('@expo/config-plugins');

// expo-notifications and @react-native-firebase/messaging both generate a
// <meta-data android:name="com.google.firebase.messaging.default_notification_color">
// tag in AndroidManifest.xml, pointing at different color resources
// (expo-notifications uses the app's configured notification color from
// app.json's `notification.color`; RNFirebase's own library manifest
// defaults to @color/white). Android's manifest merger refuses to silently
// pick one when two modules disagree on a meta-data value, and fails the
// build instead - this is exactly the "Manifest merger failed" error seen
// in the EAS build log. Adding tools:replace="android:resource" to our
// own (expo-notifications-generated) tag tells the merger our app-level
// value should win, which is what we actually want - it keeps MySheba's
// configured brand color (#1A73E8) for notification icons instead of
// silently falling back to white.
const META_DATA_NAME = 'com.google.firebase.messaging.default_notification_color';

module.exports = function withFixNotificationColorMerge(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;
    if (!application['meta-data']) application['meta-data'] = [];

    const existing = application['meta-data'].find(
      (m) => m.$['android:name'] === META_DATA_NAME
    );

    if (existing) {
      existing.$['tools:replace'] = 'android:resource';
    } else {
      // Shouldn't normally happen (expo-notifications adds this tag), but
      // fall back to a safe default pointing at the standard notification
      // icon color resource expo-notifications generates.
      application['meta-data'].push({
        $: {
          'android:name': META_DATA_NAME,
          'android:resource': '@color/notification_icon_color',
          'tools:replace': 'android:resource',
        },
      });
    }

    return config;
  });
};
