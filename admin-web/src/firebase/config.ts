// Firebase initialization for the MySheba Admin Web app.
//
// This points at the SAME Firebase project the mobile app uses
// (satulink-solutions), so admin actions here read/write the exact data
// the mobile app sees. Do not create a second project.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

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

export const auth = getAuth(app);

// Long-polling auto-detection avoids gRPC streaming issues in some
// browser/network environments (mirrors the mobile app's Firestore setup).
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

export const storage = getStorage(app);
export const functions = getFunctions(app);
