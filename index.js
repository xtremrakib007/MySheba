// Custom entry point (replaces the default node_modules/expo/AppEntry.js —
// see the "main" field in package.json).
//
// Why this file exists: react-native-firebase's background message handler
// MUST be registered at the top level, outside any React component, before
// the app registers itself — that's the only way it can run headlessly when
// the app is fully killed and a data-only FCM message arrives (an incoming
// call). Putting this inside App.js would be too late; App.js only runs
// once the JS engine is already spinning up a full app instance.
import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
// TEMP DIAGNOSTIC: commented out to test whether @notifee/react-native's
// native module is causing the launch crash under RN 0.79 / SDK 53.
// import { displayIncomingCallNotification } from './src/notifications/callPush';
import { logError } from './src/firebase/logService';
import App from './App';

// Global catch-all for any uncaught JS error anywhere in the app - not just
// React render errors (those go through ErrorBoundary.js separately). Both
// feed the same errorLog collection, visible only to superadmin (see
// AdminAnalyticsScreen.js's Logs tab / firestore.rules' errorLog match).
// Chains to RN's own default handler afterward so dev red-screens and any
// existing crash behavior are unaffected - this only adds logging on top.
const defaultGlobalHandler = global.ErrorUtils?.getGlobalHandler?.();
global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
  logError(isFatal ? 'GlobalHandler.fatal' : 'GlobalHandler.nonfatal', error);
  if (defaultGlobalHandler) defaultGlobalHandler(error, isFatal);
});

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  const data = remoteMessage?.data;
  if (data?.type === 'call') {
    // TEMP DIAGNOSTIC: Notifee call disabled, see import comment above.
    // await displayIncomingCallNotification(data);
  }
  // Other data-only pushes (if any get added later) can be handled here too.
});

registerRootComponent(App);
