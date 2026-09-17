// Encrypts sensitive values before they ever touch AsyncStorage.
//
// AsyncStorage on both Android and iOS is backed by plain, unencrypted
// storage (SQLite/flat files on Android, a plist-backed store on iOS) -
// readable by anyone with root/jailbreak access to the device, from an
// unencrypted device backup, or by another app in some misconfigured/older
// setups. It's fine for non-sensitive prefs, but never for auth tokens or
// personal data.
//
// Used for:
//   - src/firebase/config.js - legacy Firebase Auth persistence migration.
//   - src/screens/LoginScreen.js - the "Remember Me" phone number (PII).
//
// The encrypted blob itself still lives in AsyncStorage (SecureStore alone
// caps out around 2KB/item on Android, too small for Firebase's persisted
// session object) - only the AES-256 key that protects it lives in
// SecureStore (iOS Keychain / Android Keystore, hardware-backed on most
// devices) and never touches AsyncStorage. Dumping AsyncStorage's raw files
// off a compromised device gets nothing but ciphertext without also
// compromising the Keychain/Keystore.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

const KEY_STORAGE_NAME = 'mysheba_local_enc_key_v1';

let cachedKeyHex = null;

async function getOrCreateKeyHex() {
  if (cachedKeyHex) return cachedKeyHex;

  let hex = await SecureStore.getItemAsync(KEY_STORAGE_NAME);
  if (!hex) {
    const randomBytes = await Crypto.getRandomBytesAsync(32); // 256-bit AES key
    hex = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await SecureStore.setItemAsync(KEY_STORAGE_NAME, hex);
  }
  cachedKeyHex = hex;
  return hex;
}

async function encrypt(plaintext) {
  const keyHex = await getOrCreateKeyHex();
  const key = CryptoJS.enc.Hex.parse(keyHex);
  const iv = CryptoJS.lib.WordArray.random(16); // fresh IV every write - never reuse with the same key
  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return `${iv.toString(CryptoJS.enc.Hex)}:${encrypted.ciphertext.toString(CryptoJS.enc.Hex)}`;
}

async function decrypt(payload) {
  if (typeof payload !== 'string' || !payload.includes(':')) return null;
  try {
    const keyHex = await getOrCreateKeyHex();
    const key = CryptoJS.enc.Hex.parse(keyHex);
    const [ivHex, ctHex] = payload.split(':');
    const iv = CryptoJS.enc.Hex.parse(ivHex);
    const ciphertext = CryptoJS.enc.Hex.parse(ctHex);
    const decrypted = CryptoJS.AES.decrypt({ ciphertext }, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8) || null;
  } catch (e) {
    // Undecryptable - e.g. the Keystore/Keychain entry was lost on
    // reinstall or OS-level data reset. Fail closed (treat as "nothing
    // stored") rather than throwing, so a lost key just means "sign in
    // again", never a crash.
    return null;
  }
}

/**
 * Drop-in replacement for AsyncStorage's own {getItem,setItem,removeItem}
 * shape. Firebase's getReactNativePersistence() only needs those three
 * methods, so this can be passed directly in place of the raw AsyncStorage
 * import (see src/firebase/config.js) - every value is AES-256-CBC
 * encrypted before it reaches AsyncStorage and decrypted transparently on
 * read. Also used directly (getItem/setItem/removeItem) anywhere else a
 * single sensitive value needs to be cached locally.
 */
export const secureAsyncStorage = {
  async getItem(key) {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return null;
    return decrypt(raw);
  },
  async setItem(key, value) {
    const encrypted = await encrypt(value);
    await AsyncStorage.setItem(key, encrypted);
  },
  async removeItem(key) {
    await AsyncStorage.removeItem(key);
  },
};
