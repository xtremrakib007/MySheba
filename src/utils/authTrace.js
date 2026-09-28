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

// How long a specific reason outranks the generic one.
//
// 'firebase-no-user' is not a cause, it is the observation that Firebase Auth
// has no user - which is true after EVERY sign-out, including the ones whose
// cause is already known. A deliberate logout and a device takeover both call
// signOut() themselves, so the auth listener fires moments later and wrote
// 'firebase-no-user' over the reason that had just been recorded. Every
// sign-out therefore looked identical on the login screen, which defeated the
// entire point of recording one.
//
// Ten seconds is far longer than the gap between signOut() and the listener
// firing (milliseconds), and far shorter than the gap between two unrelated
// sign-outs, so it separates the two cases without a flag being threaded
// through every call site.
const SPECIFIC_WINS_MS = 10000;

/**
 * Leave a breadcrumb. Never throws - tracing must not break the auth path.
 *
 * Pass `generic: true` for a reason that merely observes the sign-out rather
 * than explaining it. A generic reason will not overwrite a specific one
 * recorded in the last few seconds.
 */
export async function noteSignOut(reason, detail, { generic = false } = {}) {
  try {
    if (generic) {
      // Its own try/catch: a corrupt stored value must read as "nothing
      // recorded", not abort the write. Sharing the outer catch meant one bad
      // entry silently stopped every future breadcrumb from being saved,
      // which is worse than the problem this guard exists to solve.
      let prevAt = NaN;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const prev = raw ? JSON.parse(raw) : null;
        if (prev && prev.at) prevAt = Date.parse(prev.at);
      } catch (e) {
        prevAt = NaN;
      }
      if (Number.isFinite(prevAt) && Date.now() - prevAt < SPECIFIC_WINS_MS) return;
    }
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
