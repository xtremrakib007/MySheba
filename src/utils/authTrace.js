// Why the app last put someone back on the Login screen.
//
// "I closed the app and it logged me out" has had several different causes,
// and from the outside they all look identical: the app opens on Login. The
// only way to tell a Firebase session that did not persist from a profile
// that failed to load from a device-takeover sign-out is to have the app say
// which one it was.
//
// It records to AsyncStorage rather than straight to Firestore because most
// of these happen with no signed-in user, and firestore.rules requires the
// errorLog row's userId to equal the caller's uid - the write would be
// denied exactly when it matters. So: leave a breadcrumb locally, and push
// it up on the next successful sign-in, when there is an account to attach
// it to.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'authTrace:lastSignOut:v1';

/** Leave a breadcrumb. Never throws - tracing must not break the auth path. */
export async function noteSignOut(reason, detail) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({
      reason: String(reason || 'unknown'),
      detail: String(detail == null ? '' : detail).slice(0, 300),
      at: new Date().toISOString(),
    }));
  } catch (e) {
    // A breadcrumb is not worth a crash.
  }
}

/** The last breadcrumb, left in place. For showing on the login screen. */
export async function peekSignOutTrace() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    return entry && entry.reason ? entry : null;
  } catch (e) {
    return null;
  }
}

/**
 * Hand the last breadcrumb to `report` and clear it. Called once a profile
 * has loaded, so the row has a uid to attach to. Returns what it reported,
 * or null when there was nothing waiting.
 */
export async function flushSignOutTrace(report) {
  let raw = null;
  try {
    raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEY);
  } catch (e) {
    return null;
  }
  let entry = null;
  try {
    entry = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (!entry || !entry.reason) return null;
  try {
    await report(entry);
  } catch (e) {
    // Reporting is best-effort; the breadcrumb is already cleared so a
    // failed write cannot wedge every later sign-in retrying it.
  }
  return entry;
}
