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
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// IMPORTANT: Firebase's official React Native persistence adapter is used
// directly here. The Auth session (including its refresh token) must survive
// Android/iOS process death and app restart. Firebase documents
// getReactNativePersistence(AsyncStorage) as the supported React Native
// setup; using a custom encrypted wrapper here caused cold-start restoration
// to be unreliable on some Android builds.
//
// secureLocalStorage remains available for other sensitive app data, but it
// must not wrap Firebase Auth's persistence adapter. Firebase owns the format
// and lifecycle of this storage entry.
export const auth =
  Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

// Firestore - long-polling auto-detection avoids connectivity issues some
// Android devices/emulators have with gRPC streaming.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});

// Storage - holds top-up receipt images (see src/firebase/topupService.js).
export const storage = getStorage(app);
export const functions = getFunctions(app);
