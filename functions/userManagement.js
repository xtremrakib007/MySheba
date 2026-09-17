// Server-side user management: creating accounts and changing roles.
//
// This MUST live here and not in client code. firestore.rules deliberately
// freezes the `role` field on update (see the `users/{uid}` update rule) so
// a compromised or modified client can never self-promote. The Admin SDK
// used below is the only thing allowed to change `role` - and even here we
// re-check the caller's own role against ROLE_PERMISSIONS before doing
// anything, so e.g. a dealer calling this function directly can never
// upgrade themselves or someone else past what a dealer is allowed to do.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assignUniqueUserId } = require('./userId');
const { logAudit, logServerError } = require('./logService');

const APP_EMAIL_DOMAIN = 'mysheba.app';

function normalizePhone(phone) { return String(phone || '').replace(/[^0-9]/g, ''); }
function phoneToEmail(phone) { return `${normalizePhone(phone)}@${APP_EMAIL_DOMAIN}`; }

const ROLE_PERMISSIONS = {
  dealer: { canCreate: ['customer'], canUpgradeTo: [] },
  admin: { canCreate: ['customer', 'dealer', 'reseller'], canUpgradeTo: ['dealer', 'reseller'] },
  superadmin: { canCreate: ['customer', 'dealer', 'admin', 'reseller'], canUpgradeTo: ['dealer', 'admin', 'reseller'] },
};
const DOWNGRADE_PERMISSIONS = {
  dealer: { dealer: 'customer' },
  admin: { dealer: 'customer', reseller: 'customer' },
  superadmin: { dealer: 'customer', admin: 'dealer', reseller: 'customer' },
};

async function getCallerProfile(uid) {
  const snap = await admin.firestore().collection('users').doc(uid).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

exports.manageUser = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const callerUid = request.auth.uid;
  const callerProfile = await getCallerProfile(callerUid);
  const callerRole = callerProfile && callerProfile.role;
  const perms = ROLE_PERMISSIONS[callerRole];
  if (!perms) throw new HttpsError('permission-denied', 'Your account cannot manage users.');
  const db = admin.firestore();
  const data = request.data || {};
  const action = data.action;

  if (action === 'create') {
    const { name, phone, pin, role, dealerId: requestedDealerId, resellerId: requestedResellerId } = data;
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const normalizedPhone = normalizePhone(phone);
    if (!cleanName || cleanName.length > 160) throw new HttpsError('invalid-argument', 'Name is required.');
    if (normalizedPhone.length < 8 || normalizedPhone.length > 20) throw new HttpsError('invalid-argument', 'A valid phone number is required.');
    if (String(pin || '').length < 6 || String(pin || '').length > 20) throw new HttpsError('invalid-argument', 'Password must be 6-20 characters.');
    if (!perms.canCreate.includes(role)) throw new HttpsError('permission-denied', `A ${callerRole} cannot create a ${role} account.`);
    let dealerId = null;
    if (role === 'customer') {
      if (callerRole === 'dealer') dealerId = callerUid;
      else if (requestedDealerId) {
        const dealerSnap = await db.collection('users').doc(String(requestedDealerId)).get();
        if (!dealerSnap.exists || dealerSnap.data().role !== 'dealer') throw new HttpsError('invalid-argument', 'That dealer was not found.');
        dealerId = String(requestedDealerId);
      }
    }
    let resellerId = null;
    if (role === 'customer' && requestedResellerId && (callerRole === 'admin' || callerRole === 'superadmin')) {
      const resellerSnap = await db.collection('users').doc(String(requestedResellerId)).get();
      if (!resellerSnap.exists || resellerSnap.data().role !== 'reseller') throw new HttpsError('invalid-argument', 'That reseller was not found.');
      resellerId = String(requestedResellerId);
    }
    let userRecord;
    try { userRecord = await admin.auth().createUser({ email: phoneToEmail(normalizedPhone), password: pin, displayName: cleanName }); }
    catch (err) {
      if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'An account with this phone number already exists.');
      await logServerError('manageUser.create', err, { userId: callerUid });
      throw new HttpsError('internal', 'Could not create the account.');
    }
    let assignedUserId = null;
    let profileCreated = false;
    try {
      assignedUserId = await assignUniqueUserId(db, userRecord.uid);
      const newProfile = { uid: userRecord.uid, userId: assignedUserId, name: cleanName, phone: normalizedPhone, role, walletBalance: 0, notifPrefs: { pushEnabled: true, emailEnabled: true, rateAlerts: false }, createdBy: callerUid, createdAt: admin.firestore.FieldValue.serverTimestamp() };
      if (dealerId) newProfile.dealerId = dealerId;
      if (resellerId) newProfile.resellerId = resellerId;
      await db.collection('users').doc(userRecord.uid).set(newProfile);
      profileCreated = true;
      await logAudit({ action: 'account_created', targetUid: userRecord.uid, performedBy: callerUid, performedByRole: callerRole, details: { role, dealerId, resellerId } });
      return { uid: userRecord.uid, userId: assignedUserId, name: cleanName, phone: normalizedPhone, role, dealerId, resellerId };
    } catch (err) {
      if (!profileCreated) {
        if (assignedUserId) await db.collection('userIds').doc(assignedUserId).delete().catch(() => {});
        await admin.auth().deleteUser(userRecord.uid).catch(() => {});
      }
      await logServerError('manageUser.create.profile', err, { userId: userRecord.uid });
      throw new HttpsError('internal', 'Could not finish creating the account.');
    }
  }

  if (action === 'setRole') {
    const { targetUid, newRole } = data;
    if (typeof targetUid !== 'string' || targetUid.length === 0 || targetUid.length > 128 || !newRole) throw new HttpsError('invalid-argument', 'targetUid and newRole are required.');
    if (!perms.canUpgradeTo.includes(newRole)) throw new HttpsError('permission-denied', `A ${callerRole} cannot upgrade a user to ${newRole}.`);
    const targetRef = db.collection('users').doc(targetUid); const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
    const target = targetSnap.data() || {};
    if (target.role !== 'customer') throw new HttpsError('permission-denied', 'Only customer accounts can be upgraded.');
    if (callerRole === 'dealer' && target.dealerId !== callerUid) throw new HttpsError('permission-denied', 'You can only upgrade your own customers.');
    await targetRef.update({ role: newRole });
    await logAudit({ action: 'role_changed', targetUid, performedBy: callerUid, performedByRole: callerRole, details: { from: target.role, to: newRole } });
    return { uid: targetUid, role: newRole };
  }

  if (action === 'setDealer') {
    if (callerRole !== 'admin' && callerRole !== 'superadmin') throw new HttpsError('permission-denied', 'Only an admin can assign a customer to a dealer.');
    const { targetUid, dealerId: newDealerId } = data;
    if (typeof targetUid !== 'string' || targetUid.length === 0 || targetUid.length > 128 || typeof newDealerId !== 'string' || newDealerId.length === 0 || newDealerId.length > 128) throw new HttpsError('invalid-argument', 'targetUid and dealerId are required.');
    const targetRef = db.collection('users').doc(targetUid); const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
    if (targetSnap.data().role !== 'customer') throw new HttpsError('invalid-argument', 'Only a customer account can be assigned to a dealer.');
    const dealerSnap = await db.collection('users').doc(newDealerId).get();
    if (!dealerSnap.exists || dealerSnap.data().role !== 'dealer') throw new HttpsError('invalid-argument', 'That dealer was not found.');
    const previousDealerId = targetSnap.data().dealerId || null;
    await targetRef.update({ dealerId: newDealerId });
    await logAudit({ action: 'dealer_reassigned', targetUid, performedBy: callerUid, performedByRole: callerRole, details: { from: previousDealerId, to: newDealerId } });
    return { uid: targetUid, dealerId: newDealerId };
  }

  if (action === 'setReseller') {
    if (callerRole !== 'admin' && callerRole !== 'superadmin') throw new HttpsError('permission-denied', 'Only an admin can assign a customer to a reseller.');
    const { targetUid, resellerId: newResellerId } = data;
    if (typeof targetUid !== 'string' || targetUid.length === 0 || targetUid.length > 128 || typeof newResellerId !== 'string' || newResellerId.length === 0 || newResellerId.length > 128) throw new HttpsError('invalid-argument', 'targetUid and resellerId are required.');
    const targetRef = db.collection('users').doc(targetUid); const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
    if (targetSnap.data().role !== 'customer') throw new HttpsError('invalid-argument', 'Only a customer account can be assigned to a reseller.');
    const resellerSnap = await db.collection('users').doc(newResellerId).get();
    if (!resellerSnap.exists || resellerSnap.data().role !== 'reseller') throw new HttpsError('invalid-argument', 'That reseller was not found.');
    const previousResellerId = targetSnap.data().resellerId || null;
    await targetRef.update({ resellerId: newResellerId });
    await logAudit({ action: 'reseller_reassigned', targetUid, performedBy: callerUid, performedByRole: callerRole, details: { from: previousResellerId, to: newResellerId } });
    return { uid: targetUid, resellerId: newResellerId };
  }

  if (action === 'downgradeRole') {
    const downgrades = DOWNGRADE_PERMISSIONS[callerRole]; const { targetUid } = data;
    if (typeof targetUid !== 'string' || targetUid.length === 0 || targetUid.length > 128) throw new HttpsError('invalid-argument', 'targetUid is required.');
    if (!downgrades) throw new HttpsError('permission-denied', `A ${callerRole} cannot downgrade users.`);
    const targetRef = db.collection('users').doc(targetUid); const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
    const target = targetSnap.data() || {}; const previousRole = target.role; const newRole = downgrades[previousRole];
    if (!newRole) throw new HttpsError('permission-denied', `A ${callerRole} cannot downgrade a ${previousRole}.`);
    if (callerRole === 'dealer' && previousRole === 'dealer' && target.dealerId !== callerUid) throw new HttpsError('permission-denied', 'You can only downgrade your own dealers.');
    await targetRef.update({ role: newRole });
    await logAudit({ action: 'role_downgraded', targetUid, performedBy: callerUid, performedByRole: callerRole, details: { from: previousRole, to: newRole } });
    return { uid: targetUid, role: newRole };
  }

  if (action === 'suspend') {
    if (callerRole !== 'admin' && callerRole !== 'superadmin') throw new HttpsError('permission-denied', 'Only an admin can suspend users.');
    const { targetUid, suspended } = data;
    if (typeof targetUid !== 'string' || targetUid.length === 0 || targetUid.length > 128 || typeof suspended !== 'boolean') throw new HttpsError('invalid-argument', 'targetUid and suspended are required.');
    if (targetUid === callerUid) throw new HttpsError('invalid-argument', 'You cannot suspend your own account.');
    const targetRef = db.collection('users').doc(targetUid); const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
    const targetRole = targetSnap.data().role;
    if (targetRole === 'superadmin' || (targetRole === 'admin' && callerRole !== 'superadmin')) throw new HttpsError('permission-denied', 'You cannot suspend that staff account.');

    let previousAuthDisabled = false;
    try {
      const targetAuth = await admin.auth().getUser(targetUid);
      previousAuthDisabled = Boolean(targetAuth.disabled);
      await admin.auth().updateUser(targetUid, { disabled: suspended });
    } catch (err) {
      await logServerError('manageUser.suspend.auth', err, { userId: targetUid });
      throw new HttpsError('internal', 'Could not update the account status.');
    }
    try {
      await targetRef.update({ suspended: Boolean(suspended), suspendedAt: suspended ? admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.delete(), suspendedBy: suspended ? callerUid : admin.firestore.FieldValue.delete() });
    } catch (err) {
      await admin.auth().updateUser(targetUid, { disabled: previousAuthDisabled }).catch(async (rollbackErr) => {
        await logServerError('manageUser.suspend.rollback', rollbackErr, { userId: targetUid });
      });
      await logServerError('manageUser.suspend.firestore', err, { userId: targetUid });
      throw new HttpsError('internal', 'Could not update the account status.');
    }
    await logAudit({ action: suspended ? 'account_suspended' : 'account_unsuspended', targetUid, performedBy: callerUid, performedByRole: callerRole });
    return { uid: targetUid, suspended: Boolean(suspended) };
  }

  throw new HttpsError('invalid-argument', 'Unknown user-management action.');
});
