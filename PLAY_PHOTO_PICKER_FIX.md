# Google Play Photo/Video Picker Compliance Fix

Changes in this source:
- Removed all `requestMediaLibraryPermissionsAsync()` calls from MySheba.
- Photo/video library selection continues through `expo-image-picker`'s
  `launchImageLibraryAsync`, allowing Android 13+ to use the system Photo Picker.
- Added manifest-removal protection for both `READ_MEDIA_IMAGES` and
  `READ_MEDIA_VIDEO`.
- Kept camera permission flows intact.
- Kept DocumentPicker flows intact.
- Preserved existing upload/storage/backend logic.
- Bumped Android versionCode from 24 to 25 and app version to 5.4.0.6.

Before the Play upload, build a fresh AAB (do not reuse the old version-code-18
artifact). After prebuild, verify the merged Android manifest has no
READ_MEDIA_IMAGES or READ_MEDIA_VIDEO.
