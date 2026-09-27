// Lightweight activity + client-error logging for MySheba.
//
// Two collections, two different trust levels (see firestore.rules):
//  - activityLog: usage analytics (login, screen views, key actions).
//    Written directly by the client for its own uid. Not sensitive, not
//    an audit trail - a compromised client could spam junk into it, but
//    that's no worse than any other analytics pipeline, and nothing here
//    is used for security decisions.
//  - errorLog: client-side crash/error reports, source: 'client'. Same
//    trust level as activityLog - a lightweight in-app-visible
//    complement to a real crash tool (Sentry/Crashlytics), not a
//    replacement for one.
//
// Account-security-relevant events (role changes, account creation,
// suspensions) are NOT logged from here - those go through
// userAuditLog, written only by Cloud Functions via the Admin SDK (see
// functions/logService.js), since letting the client write its own
// audit trail would defeat the point of having one.
//
// Every call here is fire-and-forget and never throws - logging must
// never be able to break the feature it's attached to.

import { collection, addDoc, query, where, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { db, auth } from './config';

function appVersion() {
  return (Constants && Constants.expoConfig && Constants.expoConfig.version) || 'unknown';
}

/** Records a usage event for the signed-in user.
 * `action` is a short snake_case string, e.g.:
 *   'login', 'logout', 'screen_view', 'recharge_submitted',
 *   'topup_requested', 'points_transferred', 'support_ticket_created'
 * `metadata` is a small plain object of extra context - keep it light,
 * and never put anything from <sensitive_information> in it (no PIN,
 * no full phone number, no wallet balance history, etc).
 * Does nothing (silently) if no one is signed in. */
export async function logActivity(action, metadata) {
  const uid = auth.currentUser && auth.currentUser.uid;
  if (!uid) return;
  try {
    await addDoc(collection(db, 'activityLog'), {
      userId: uid,
      action,
      metadata: metadata || {},
      platform: Platform.OS,
      appVersion: appVersion(),
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // Never let a logging failure surface to the user or break the caller.
    console.warn('logActivity failed', action, e && e.message);
  }
}

/** Records a client-side error/exception.
 * `context` identifies where it happened, e.g. 'TopUpScreen.submit' or
 * 'ChatScreen.sendMessage'. `error` is the caught Error object (or a
 * plain string/message). Wrap risky client code in try/catch and call
 * this from the catch block - it does not throw itself. */
export async function logError(context, error, extra) {
  const uid = (auth.currentUser && auth.currentUser.uid) || null;
  try {
    await addDoc(collection(db, 'errorLog'), {
      source: 'client',
      context,
      message: String((error && error.message) || error || 'Unknown error'),
      stack: String((error && error.stack) || '').slice(0, 2000),
      // A render crash's minified Hermes stack names nothing useful, so
      // ErrorBoundary passes React's component stack through here instead.
      ...(extra && typeof extra === 'object' ? extra : null),
      userId: uid,
      platform: Platform.OS,
      appVersion: appVersion(),
      resolved: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('logError failed to write', e && e.message);
  }
}

/** Live feed of just 'login' events, sorted newest-first client-side - used
 * to compute today/this-week unique-login counts on AdminLogsScreen's stats
 * header. Deliberately NOT combined with orderBy('createdAt') server-side:
 * a where + orderBy on different fields needs a composite Firestore index,
 * same reason several other subscribe* functions in this app sort client-
 * side instead (see e.g. subscribeMyTransactions in transactionService.js).
 * pageSize is generous (500) since this only reads 'login' rows, not the
 * whole activityLog, but it's still a cap - an app with heavier daily login
 * volume than that would need this to page further back for full accuracy. */
export function subscribeLoginEvents(callback, onError, pageSize = 500) {
  const q = query(collection(db, 'activityLog'), where('action', '==', 'login'), limit(pageSize));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      callback(list);
    },
    onError
  );
}

// ---------------------------------------------------------------------------
// Admin-facing readers - power the "Activity Logs" screen (Admin sidebar).
// Only admin/superadmin can actually read these per firestore.rules; a
// non-admin's subscription will just error out silently via onError.
// LOG_PAGE_SIZE caps each live query so a busy app doesn't try to stream an
// ever-growing collection into memory - "Load more" pages further back by
// re-subscribing with a larger limit.
const LOG_PAGE_SIZE = 100;

/** Live feed of usage events (login, topup_requested, points_transferred,
 * etc.), newest first, capped at `pageSize`. */
export function subscribeActivityLog(callback, onError, pageSize = LOG_PAGE_SIZE) {
  const q = query(collection(db, 'activityLog'), orderBy('createdAt', 'desc'), limit(pageSize));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Live feed of client + server error reports, newest first. */
export function subscribeErrorLog(callback, onError, pageSize = LOG_PAGE_SIZE) {
  const q = query(collection(db, 'errorLog'), orderBy('createdAt', 'desc'), limit(pageSize));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Live feed of account-security-relevant events (account_created,
 * role_changed, otp_locked_out, etc.), newest first. */
export function subscribeAuditLog(callback, onError, pageSize = LOG_PAGE_SIZE) {
  const q = query(collection(db, 'userAuditLog'), orderBy('createdAt', 'desc'), limit(pageSize));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Marks an errorLog entry resolved/unresolved - the only field an admin
 * may change on it (see firestore.rules' errorLog update rule). */
export async function setErrorResolved(id, resolved) {
  const uid = auth.currentUser && auth.currentUser.uid;
  await updateDoc(doc(db, 'errorLog', id), {
    resolved: !!resolved,
    resolvedBy: resolved ? uid || null : null,
    resolvedAt: resolved ? serverTimestamp() : null,
  });
}
