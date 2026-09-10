// Custom entry point (replaces the default node_modules/expo/AppEntry.js —
// see the "main" field in package.json).
//
// react-native-firebase's background message handler MUST be registered at
// the top level so a data-only FCM message can wake the JS engine when the
// app is killed. Incoming calls are surfaced through Notifee from here.
import { registerRootComponent } from 'expo';
import messaging from '@react-native-firebase/messaging';
import { displayIncomingCallNotification } from './src/notifications/callPush';
import { logError } from './src/firebase/logService';
import App from './App';

const defaultGlobalHandler = global.ErrorUtils?.getGlobalHandler?.();
global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
  logError(isFatal ? 'GlobalHandler.fatal' : 'GlobalHandler.nonfatal', error);
  if (defaultGlobalHandler) defaultGlobalHandler(error, isFatal);
});

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  const data = remoteMessage?.data;
  if (data?.type === 'call') {
    try {
      await displayIncomingCallNotification(data);
    } catch (error) {
      logError('IncomingCallNotification.background', error);
    }
  }
});

registerRootComponent(App);
