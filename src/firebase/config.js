// Firebase initialization for MySheba (production).
//
// This is the single place the Firebase project config lives. Values below
// are the project's public web config (safe to ship in the app bundle -
// Firebase security is enforced by Firestore/Auth rules, not by hiding this
// object). If you ever need to point the app at a different Firebase
// project, this is the only file to change.
import { initializeApp, getApps, getApp } from 'firebase/app';
// NOTE: getReactNativePersistence lives on the main 'firebase/auth' entry,
// not a 'firebase/auth/react-native' subpath (that subpath doesn't exist in
// firebase v10.x and Metro fails to resolve it). Metro's "react-native"
// export condition automatically swaps in @firebase/auth's RN-specific
// build for the plain 'firebase/auth' import, so this one import covers both.
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { Platform } from 'react-native';
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

// Auth: on native (Android/iOS via Expo) we need persistent storage or the
// user gets signed out every time the app restarts. secureAsyncStorage
// (src/firebase/secureLocalStorage.js) is a drop-in for AsyncStorage that
// transparently AES-encrypts everything it stores, keyed by a hardware-
// backed secret in SecureStore - so the persisted session (ID/refresh
// tokens) never sits on disk as plain JSON the way raw AsyncStorage would
// leave it. On web (e.g. `expo start --web`) initializeAuth with RN
// persistence throws, so fall back to the default getAuth() there.
export const auth =
  Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, { persistence: getReactNativePersistence(secureAsyncStorage) });

// Firestore - long-polling auto-detection avoids connectivity issues some
// Android devices/emulators have with gRPC streaming.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});

// Storage - holds top-up receipt images (see src/firebase/topupService.js).
export const storage = getStorage(app);
export const functions = getFunctions(app);
