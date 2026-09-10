// Firebase initialization for MySheba (production).
//
// This is the single place the Firebase project config lives. Values below
// are the project's public web config (safe to ship in the app bundle -
// Firebase security is enforced by Firestore/Auth rules, not by hiding this
// object). If you ever need to point the app at a different Firebase
// project, this is the only file to change.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
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

// Firebase Auth persistence on native uses Firebase's supported React Native
// persistence implementation backed by AsyncStorage. This is the reliable
// path for restoring the Firebase session after the Android/iOS process is
// killed or the app is reopened.
//
// Compatibility/migration: older MySheba builds stored Firebase's persisted
// auth object through secureAsyncStorage (AES encrypted). On the first launch
// after this fix, if an old encrypted Firebase session is still present, read
// it through the legacy storage and copy the decrypted JSON into AsyncStorage
// so the user does NOT have to log in again. New Firebase Auth writes use the
// normal native persistence path from then on.
const firebaseAuthPersistence = {
  async getItem(key) {
    const raw = await AsyncStorage.getItem(key);
    if (raw != null) {
      // New/native Firebase persistence is JSON. Old secure persistence is
      // stored as "ivHex:ciphertextHex", so do not hand that ciphertext to
      // Firebase's JSON parser.
      if (raw.trim().startsWith('{') || raw.trim().startsWith('[') || raw === 'null') {
        return raw;
      }
    }

    // Try the previous encrypted storage format for an existing session.
    const legacy = await secureAsyncStorage.getItem(key);
    if (legacy != null) {
      // Migrate only values that look like Firebase's JSON persistence data.
      if (typeof legacy === 'string' && (legacy.trim().startsWith('{') || legacy.trim().startsWith('['))) {
        try { await AsyncStorage.setItem(key, legacy); } catch (_) { /* migration is best-effort */ }
        return legacy;
      }
    }
    return raw;
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
