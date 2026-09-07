// Server-side audit + error logging, written via the Admin SDK - so it
// bypasses firestore.rules entirely. This is the ONLY writer of
// userAuditLog, and one of two writers of errorLog (the client writes its
// own reports directly - see src/firebase/logService.js).
//
// Every call here is fire-and-forget and never throws - logging must
// never be able to break the Cloud Function it's attached to. Callers
// should NOT await-and-bail on these; fire the promise and move on, or
// await it only to keep ordering sane, never wrap it in logic that
// changes the function's own success/failure path.

const admin = require('firebase-admin');

function db() {
  return admin.firestore();
}

/** Records an account-security-relevant event: role changes, account
 * creation, dealer reassignment, suspensions - anything a real audit
 * trail needs to survive even a compromised client. Call this from
 * inside the Cloud Function that performs the change, after it commits.
 *   action           short string, e.g. 'account_created', 'role_changed'
 *   targetUid        the account being acted on
 *   performedBy      the caller's uid ('system' for non-callable jobs)
 *   performedByRole  the caller's role at the time, for quick filtering
 *   details          small plain object, e.g. { from: 'customer', to: 'dealer' }
 */
async function logAudit({ action, targetUid, performedBy, performedByRole, details }) {
  try {
    await db().collection('userAuditLog').add({
      action,
      targetUid: targetUid || null,
      performedBy: performedBy || 'system',
      performedByRole: performedByRole || null,
      details: details || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('logAudit failed to write', action, e);
  }
}

/** Records a server-side error caught inside a Cloud Function.
 *   fn      the function name, e.g. 'sendOtp', 'manageUser'
 *   error   the caught exception
 *   extra   optional { userId } for context, if known
 * Call this from a catch block alongside (not instead of) the normal
 * HttpsError you throw back to the client - this is for admin visibility
 * in-app, functions:log / Cloud Logging still has the full trace. */
async function logServerError(fn, error, extra) {
  try {
    await db().collection('errorLog').add({
      source: 'server',
      context: fn,
      message: String((error && error.message) || error || 'Unknown error'),
      stack: String((error && error.stack) || '').slice(0, 2000),
      userId: (extra && extra.userId) || null,
      resolved: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('logServerError failed to write', fn, e);
  }
}

/**
 * PHASE 2 - Records a security-relevant Advertisement-system action
 * (Global Controls change, per-feature ad control change) into
 * ad_audit_logs - mirrors logAudit above exactly, just a different
 * collection/shape (matches AdAuditLog in src/types/ads.ts). This is the
 * ONLY writer of ad_audit_logs: that collection's firestore.rules is
 * `allow write: if false`, so every entry here was written by the Admin
 * SDK from inside a Cloud Function, never forgeable or erasable by a
 * client - see functions/adControlsService.js, the only caller.
 *   action        e.g. 'settings_change' (AD_AUDIT_ACTIONS in src/constants/adEnums.ts)
 *   targetType    'ad_settings' | 'ad_feature_control'
 *   targetId      'general' for ad_settings, a FeatureId (or 'bulk') for ad_feature_control
 *   performedBy   the calling superadmin's uid
 *   details       small plain object, e.g. the changed fields and their new values
 */
async function logAdAudit({ action, targetType, targetId, performedBy, details }) {
  try {
    await db().collection('ad_audit_logs').add({
      action,
      targetType,
      targetId: targetId || null,
      performedBy: performedBy || 'system',
      details: details || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('logAdAudit failed to write', action, targetType, targetId, e);
  }
}

module.exports = { logAudit, logServerError, logAdAudit };
