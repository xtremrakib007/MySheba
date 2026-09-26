// Last known-good profile, kept on the device.
//
// The app treated "we could not read the profile" as "this person is signed
// out". The profile comes from a live Firestore listener, so a dropped
// connection, a cold start with no network, or any transient listener error
// set profile to null - and the hard auth boundary in AppContext then routed
// to Login. Firebase Auth still had a valid persisted session the whole
// time. From the outside that is indistinguishable from being logged out,
// and it is what "why login not keep saved" describes.
//
// Caching the last good profile breaks that chain: on launch the app has
// something to render immediately, so it opens on Home and lets the live
// listener confirm or correct it, rather than bouncing to Login while it
// waits. The cache is only ever cleared by a real answer - a deliberate
// logout, or the server saying this account may no longer use the app.
//
// Through secureAsyncStorage because a profile is personal data: name,
// phone, wallet balance, role. AsyncStorage on its own is plaintext on disk.
import { secureAsyncStorage } from './secureLocalStorage';

const KEY = (uid) => `mysheba_profile_cache_v1_${uid}`;

// Guards against a profile cached by one account being shown to another.
function withUid(uid, profile) {
  return { uid, cachedAt: Date.now(), profile };
}

export async function readCachedProfile(uid) {
  if (!uid) return null;
  try {
    const raw = await secureAsyncStorage.getItem(KEY(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.uid !== uid || !parsed.profile) return null;
    return parsed.profile;
  } catch (_) {
    // A cache that cannot be read is simply a cache miss - the listener is
    // still the source of truth, this only costs the offline head start.
    return null;
  }
}

export async function writeCachedProfile(uid, profile) {
  if (!uid || !profile) return;
  try {
    await secureAsyncStorage.setItem(KEY(uid), JSON.stringify(withUid(uid, profile)));
  } catch (_) {
    // Non-fatal: the app runs fine from the live listener alone.
  }
}

export async function clearCachedProfile(uid) {
  if (!uid) return;
  try {
    await secureAsyncStorage.removeItem(KEY(uid));
  } catch (_) {
    // Nothing to do - a stale entry is re-validated by uid on read.
  }
}
