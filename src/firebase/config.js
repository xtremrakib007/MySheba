// Firebase initialization for MySheba (production).
//
// This is the single place the Firebase project config lives. Values below
// are the project's public web config (safe to ship in the app bundle -
// Firebase security is enforced by Firestore/Auth rules, not by hiding this
// object). If you ever need to point the app at a different Firebase project,
// this is the only file to change.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck as initializeWebAppCheck, CustomProvider } from 'firebase/app-check';
import nativeAppCheck, { ReactNativeFirebaseAppCheckProvider } from '@react-native-firebase/app-check';
import nativeFirebaseApp from '@react-native-firebase/app';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureAsyncStorage } from './secureLocalStorage';

const firebaseConfig = {
  apiKey: 'AIzaSyDvuBqLFIbhCIRku-sO7NOeDBBiGy3YmmY',
  authDomain: 'satulink-solutions.firebaseapp.com',
  projectId: 'satulink-solutions',
  storageBucket: 'satulink-solutions.firebasestorage.app',
  messagingSenderId: '632456211568',
  appId: '1:632456211568:web:8c7f4e49d30dd032fa58b5',
  measurementId: 'G-HV1BZV9SQT',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// App Check: the app uses the Firebase JS SDK for Auth/Firestore/Functions,
// while Android/iOS use the native Play Integrity/App Attest providers. The
// native token is bridged into the JS SDK through Firebase's CustomProvider so
// callable functions receive the App Check token without changing every call site.
let nativeAppCheckInstance = null;
let webAppCheck = null;
if (Platform.OS !== 'web') {
  try {
    const provider = new ReactNativeFirebaseAppCheckProvider();
    provider.configure({
      android: { provider: __DEV__ ? 'debug' : 'playIntegrity' },
      apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback' },
    });
    nativeAppCheckInstance = nativeAppCheck();
    nativeAppCheckInstance.initializeAppCheck({ provider, isTokenAutoRefreshEnabled: true });
    webAppCheck = initializeWebAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          const result = await nativeAppCheckInstance.getToken();
          return { token: result.token, expireTimeMillis: result.expireTimeMillis };
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    // Do not crash the application during development before native App Check
    // is registered. Production enforcement should be enabled only after the
    // production app has been registered and verified in Firebase Console.
    if (__DEV__) console.warn('Firebase App Check initialization failed', error);
  }
}
export { webAppCheck as appCheck };

// Firebase's official React Native persistence implementation is backed by
// @react-native-async-storage/async-storage. New Auth state is therefore
// stored directly in AsyncStorage and survives Android/iOS process death and
// app restart. This avoids putting Firebase's own persistence protocol behind
// a custom crypto adapter, which was the source of unreliable cold-start
// restoration in the previous build.
//
// One-time compatibility: previous MySheba builds stored the Firebase Auth
// entry through secureAsyncStorage. If that old encrypted entry exists and
// there is no native entry yet, read/decrypt it once, copy the JSON into the
// official native store, and use native AsyncStorage for all future reads and
// writes. This prevents an update from unnecessarily forcing an existing user
// to log in again.
const firebaseAuthPersistence = {
  async getItem(key) {
    const nativeValue = await AsyncStorage.getItem(key);
    if (nativeValue != null) return nativeValue;

    try {
      const legacyValue = await secureAsyncStorage.getItem(key);
      if (legacyValue != null) {
        await AsyncStorage.setItem(key, legacyValue);
        return legacyValue;
      }
    } catch (_) {
      // If the legacy key cannot be opened, Firebase simply starts without a
      // persisted user. A normal explicit login will create the new native
      // persistence entry from that point onward.
    }
    return null;
  },
  async setItem(key, value) {
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key) {
    await AsyncStorage.removeItem(key);
  },
};

export const auth =
  Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, { persistence: getReactNativePersistence(firebaseAuthPersistence) });

// Firestore - long-polling auto-detection avoids connectivity issues some
// Android devices/emulators have with gRPC streaming.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});

// Storage - holds top-up receipt images (see src/firebase/topupService.js).
export const storage = getStorage(app);
export const functions = getFunctions(app);
