const { withAndroidStyles, AndroidConfig } = require('@expo/config-plugins');

// Keeps MySheba light on a phone in dark mode.
//
// The app has one appearance (light: src/theme/ThemeContext.js forces it and
// app.base.json sets userInterfaceStyle "light", which expo-system-ui applies
// on Android). Some Android phones also "force dark" apps on their own,
// recolouring views the app never asked to change; text with no colour of its
// own then came out light on the app's white cards and nothing was readable.
// android:forceDarkAllowed="false" on the app theme opts out. Needs a new
// native build; an OTA update cannot change the theme.
module.exports = function withLightOnlyAndroid(config) {
  return withAndroidStyles(config, (config) => {
    config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:forceDarkAllowed',
      value: 'false',
    });
    return config;
  });
};
