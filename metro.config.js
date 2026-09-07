const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const config = getDefaultConfig(__dirname);

// ENOSPC workaround for Termux/Android: the OS inotify watch limit is fixed
// and can't be raised without root, so keep Metro from watching folders it
// doesn't need (native Gradle/Kotlin build tooling, iOS project, and test
// fixtures buried in transitive dependencies). requireg/node_modules/resolve
// specifically ships a self-referential symlink in its test fixtures
// (resolve/test/resolver/symlinked/_/symlink_target -> itself) that's a
// well-known runaway-watcher trigger on Linux/Android - excluded below along
// with every other nested test/tests/__tests__ folder inside node_modules,
// none of which Metro ever needs to bundle an app.
config.resolver.blockList = exclusionList([
  /node_modules\/@react-native\/gradle-plugin\/.*/,
  /node_modules\/@react-native\/debugger-frontend\/.*/,
  /node_modules\/react-native\/ReactAndroid\/.*/,
  /node_modules\/react-native\/ReactCommon\/.*/,
  /node_modules\/react-native\/sdks\/.*/,
  /node_modules\/react-native\/third-party.*/,
  /node_modules\/requireg\/.*/,
  /node_modules\/.*\/node_modules\/resolve\/test\/.*/,
  /node_modules\/resolve\/test\/.*/,
  /node_modules\/.*\/(test|tests|__tests__)\/.*/,
  // Nested duplicate copies of firebase (e.g.
  // @react-native-firebase/app/node_modules/firebase) that npm installs
  // when hoisting fails on a peer version mismatch. The app only ever
  // imports the top-level node_modules/firebase (see package.json) - RN
  // Firebase's own JS talks to native modules, not this nested copy - and
  // firebase's SDK alone ships enough esm/esm2017/cjs/compat duplicate
  // builds to eat the whole watcher budget by itself if left in twice.
  /node_modules\/.*\/node_modules\/firebase\/.*/,
  // firebase's legacy namespaced v8 "compat" build, confirmed unused -
  // src/firebase/config.js only imports the modular v9+ API
  // (firebase/app, firebase/auth, firebase/firestore, firebase/storage,
  // firebase/functions), never firebase/compat/*.
  /node_modules\/firebase\/.*\/compat\/.*/,
  /android\/.*/,
  /ios\/.*/,
]);

module.exports = config;
