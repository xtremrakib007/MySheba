module.exports = function (api) {
  // api.cache(true) used to cache this config forever regardless of env -
  // fine when the config never varies, but now that it branches on
  // NODE_ENV, a stale cache would mean a dev-then-production build in the
  // same Metro process (or CI cache) keeps whichever branch ran first.
  // api.cache.using() re-runs this function whenever the cache key changes
  // instead, so switching NODE_ENV always gets a fresh config.
  api.cache.using(() => process.env.NODE_ENV);
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Release-build-only console stripping. EAS Build sets
      // NODE_ENV=production for its release bundling step (development/
      // preview profiles in eas.json do not), so this never touches a
      // dev-client or internal preview build - only what actually ships.
      //
      // Keeps console.error so a crash reporter's console breadcrumb
      // integration (or `adb logcat` during a field-support session)
      // still sees something - strips console.log/warn/info/debug, which
      // is what's actually scattered through the app (search failures and
      // their error codes/messages in AddContactScreen.js/
      // NewGroupScreen.js, Firestore listener errors in AppContext.js,
      // push/FCM token registration failures in pushService.js, the
      // ErrorBoundary's own caught-error dump). None of that needs to be
      // readable in a signed release build - the caught error is already
      // where it belongs (errorLog via src/firebase/logService.js's
      // logError, or the equivalent server-side logServerError) - console
      // output here was only ever useful with a debugger physically
      // attached, which a release build isn't meant to make easy.
      isProduction && ['transform-remove-console', { exclude: ['error'] }],
    ].filter(Boolean),
  };
};
