// Encrypts sensitive values before they ever touch AsyncStorage.
//
// AsyncStorage on both Android and iOS is backed by plain, unencrypted
// storage (SQLite/flat files on Android, a plist-backed store on iOS) -
// readable by anyone with root/jailbreak access to the device, from an
// unencrypted device backup, or by another app in some misconfigured/older
// setups. It's fine for non-sensitive prefs, but never for auth tokens or
// personal data.
//
// The encrypted blob itself still lives in AsyncStorage. The AES-256 key that
// protects it lives in SecureStore (iOS Keychain / Android Keystore). Values
// use authenticated encryption semantics: AES-256-CBC provides confidentiality
// and a separate HMAC-SHA256 tag provides integrity/authenticity. A forged or
// corrupted blob therefore fails closed instead of being accepted as a
// modified Firebase persistence object.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

const KEY_STORAGE_NAME = 'mysheba_local_enc_key_v1';
const STORAGE_VERSION = 'v2';

let cachedKeyHex = null;

async function getOrCreateKeyHex() {
  if (cachedKeyHex) return cachedKeyHex;

  let hex = await SecureStore.getItemAsync(KEY_STORAGE_NAME);
  if (!hex) {
    const randomBytes = await Crypto.getRandomBytesAsync(32); // 256-bit master key
    hex = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await SecureStore.setItemAsync(KEY_STORAGE_NAME, hex);
  }
  cachedKeyHex = hex;
  return hex;
}

function deriveKey(keyHex, purpose) {
  return CryptoJS.SHA256(`${purpose}:${keyHex}`);
}

function constantTimeHexEqual(left, right) {
  const a = String(left || '').toLowerCase();
  const b = String(right || '').toLowerCase();
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function encrypt(plaintext) {
  const keyHex = await getOrCreateKeyHex();
  const encryptionKey = deriveKey(keyHex, 'encryption');
  const macKey = deriveKey(keyHex, 'authentication');
  const iv = CryptoJS.lib.WordArray.random(16); // fresh IV every write - never reuse with the same key
  const encrypted = CryptoJS.AES.encrypt(plaintext, encryptionKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const ivHex = iv.toString(CryptoJS.enc.Hex);
  const ciphertextHex = encrypted.ciphertext.toString(CryptoJS.enc.Hex);
  const authenticatedData = `${STORAGE_VERSION}:${ivHex}:${ciphertextHex}`;
  const tagHex = CryptoJS.HmacSHA256(authenticatedData, macKey).toString(CryptoJS.enc.Hex);
  return `${authenticatedData}:${tagHex}`;
}

async function decrypt(payload) {
  if (typeof payload !== 'string') return null;
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== STORAGE_VERSION) return null;
  const [, ivHex, ctHex, tagHex] = parts;
  if (!/^[0-9a-f]{32}$/i.test(ivHex) || !/^[0-9a-f]+$/i.test(ctHex) || !/^[0-9a-f]{64}$/i.test(tagHex) || ctHex.length === 0 || ctHex.length % 32 !== 0) return null;
  try {
    const keyHex = await getOrCreateKeyHex();
    const encryptionKey = deriveKey(keyHex, 'encryption');
    const macKey = deriveKey(keyHex, 'authentication');
    const authenticatedData = `${STORAGE_VERSION}:${ivHex}:${ctHex}`;
    const expectedTag = CryptoJS.HmacSHA256(authenticatedData, macKey).toString(CryptoJS.enc.Hex);
    if (!constantTimeHexEqual(expectedTag, tagHex)) return null;
    const iv = CryptoJS.enc.Hex.parse(ivHex);
    const ciphertext = CryptoJS.enc.Hex.parse(ctHex);
    const decrypted = CryptoJS.AES.decrypt({ ciphertext }, encryptionKey, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8) || null;
  } catch (e) {
    // Undecryptable, unauthenticated, or otherwise malformed data fails
    // closed. A lost Keystore/Keychain entry or a storage-format migration
    // therefore means "sign in again", never "accept modified auth state".
    return null;
  }
}

/**
 * Drop-in replacement for AsyncStorage's own {getItem,setItem,removeItem}
 * shape. Firebase's getReactNativePersistence() only needs those three
 * methods, so this can be passed directly in place of the raw AsyncStorage
 * import (see src/firebase/config.js). Sensitive values are authenticated
 * before they are returned to callers.
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
