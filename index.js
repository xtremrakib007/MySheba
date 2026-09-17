// Custom entry point (replaces the default node_modules/expo/AppEntry.js —
// see the "main" field in package.json).
//
// react-native-firebase's background message handler is registered at the
// top level so data-only FCM messages can be received when the app is killed.
// Call-specific handling was removed because voice/video calling is no
// longer part of MySheba; normal push/background delivery remains enabled.
import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import { logError } from './src/firebase/logService';
import App from './App';

const defaultGlobalHandler = global.ErrorUtils?.getGlobalHandler?.();
global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
  logError(isFatal ? 'GlobalHandler.fatal' : 'GlobalHandler.nonfatal', error);
  if (defaultGlobalHandler) defaultGlobalHandler(error, isFatal);
});

// Keep FCM background registration for normal data-only notifications.
// There is intentionally no call/ringtone/full-screen notification path here.
messaging().setBackgroundMessageHandler(async () => {});

registerRootComponent(App);
