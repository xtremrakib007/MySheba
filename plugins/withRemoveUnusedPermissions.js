const { withAndroidManifest } = require('@expo/config-plugins');

// Two permissions end up in MySheba's merged Android manifest that the app
// doesn't actually use, both pulled in automatically by dependencies rather
// than requested on purpose:
//
// 1. FOREGROUND_SERVICE_MEDIA_PROJECTION - bundled by react-native-agora's
//    Android SDK for its optional screen-share/streaming feature. MySheba
//    only uses Agora for voice/video calling (see src/screens/CallScreen.js),
//    never screen or media projection.
//
// 2. READ_MEDIA_IMAGES / READ_MEDIA_VIDEO - broad photo/video library
//    permissions. MySheba uses the Android system Photo Picker through
//    expo-image-picker's launchImageLibraryAsync instead of requesting
//    access to the user's entire media library.
//
// Keep these removal entries as a belt-and-braces measure so transitive
// native dependencies cannot re-add them during manifest merge.
const UNUSED_PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
];

module.exports = function withRemoveUnusedPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest['uses-permission']) return config;

    manifest['uses-permission'] = manifest['uses-permission'].filter(
      (perm) => !UNUSED_PERMISSIONS.includes(perm.$['android:name'])
    );

    // Belt-and-braces: add tools:node="remove" entries so the manifest
    // merger strips them even if a library re-adds them later.
    for (const permName of UNUSED_PERMISSIONS) {
      manifest['uses-permission'].push({
        $: {
          'android:name': permName,
          'tools:node': 'remove',
        },
      });
    }

    return config;
  });
};
