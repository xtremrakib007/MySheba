// Server-side user management: creating accounts and changing roles.
// All privileged mutations remain behind this callable and the Admin SDK.
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
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

exports.manageUser = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const callerUid = request.auth.uid;
  const callerProfile = await getCallerProfile(callerUid);
  const callerRole = callerProfile?.role;
  const perms = ROLE_PERMISSIONS[callerRole];
  if (!perms) throw new HttpsError('permission-denied', 'Your account cannot manage users.');

  const db = admin.firestore();
  const action = request.data?.action;

  if (action === 'create') {
    const { name, phone, pin, role, dealerId: requestedDealerId, resellerId: requestedResellerId } = request.data;
    if (!name || !name.trim()) throw new HttpsError('invalid-argument', 'Name is required.');
    if (!phone || normalizePhone(phone).length < 8) throw new HttpsError('invalid-argument', 'A valid phone number is required.');
    if (String(pin || '').length < 6 || String(pin || '').length > 20) throw new HttpsError('invalid-argument', 'Password must be 6-20 characters.');
    if (!perms.canCreate.includes(role)) throw new HttpsError('permission-denied', `A ${callerRole} cannot create a ${role} account.`);
    let dealerId = null;
    if (role === 'customer') {
      if (callerRole === 'dealer') dealerId = callerUid;
      else if (requestedDealerId) {
        const dealerSnap = await db.collection('users').doc(requestedDealerId).get();
        if (!dealerSnap.exists || dealerSnap.data().role !== 'dealer') throw new HttpsError('invalid-argument', 'That dealer was not found.');
        dealerId = requestedDealerId;
      }
    }
    let resellerId = null;
    if (role === 'customer' && requestedResellerId && (callerRole === 'admin' || callerRole === 'superadmin')) {
      const resellerSnap = await db.collection('users').doc(requestedResellerId).get();
      if (!resellerSnap.exists || resellerSnap.data().role !== 'reseller') throw new HttpsError('invalid-argument', 'That reseller was not found.');
      resellerId = requestedResellerId;
    }
    const email = phoneToEmail(phone);
    let userRecord;
    try { userRecord = await admin.auth().createUser({ email, password: pin, displayName: name.trim() }); }
    catch (err) {
      if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'An account with this phone number already exists.');
      await logServerError('manageUser.create', err, { userId: callerUid });
      throw new HttpsError('internal', 'Could not create the account.');
    }
    const newProfile = {
      uid: userRecord.uid,
      userId: await assignUniqueUserId(db, userRecord.uid),
      name: name.trim(), phone: normalizePhone(phone), role,
      walletBalance: 0,
      notifPrefs: { pushEnabled: true, emailEnabled: true, rateAlerts: false },
      createdBy: callerUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (dealerId) newProfile.dealerId = dealerId;
    if (resellerId) newProfile.resellerId = resellerId;
    await db.collection('users').doc(userRecord.uid).set(newProfile);
    await logAudit({ action: 'account_created', targetUid: userRecord.uid, performedBy: callerUid, performedByRole: callerRole, details: { role, dealerId, resellerId } });
    return { uid: userRecord.uid, userId: newProfile.userId, name: name.trim(), phone: normalizePhone(phone), role, dealerId, resellerId };
  }

  if (action === 'setRole') {
    const { targetUid, newRole } = request.data;
    if (!targetUid || !newRole) throw new HttpsError('invalid-argument', 'targetUid and newRole are required.');
    if (!perms.canUpgradeTo.includes(newRole)) throw new HttpsError('permission-denied', `A ${callerRole} cannot upgrade a user to ${newRole}.`);
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
    if (callerRole === 'dealer' && newRole === 'dealer' && targetSnap.data().dealerId !== callerUid) throw new HttpsError('permission-denied', 'You can only upgrade your own customers.');
    const previousRole = targetSnap.data().role;
    await targetRef.update({ role: newRole });
    await logAudit({ action: 'role_changed', targetUid, performedBy: callerUid, performedByRole: callerRole, details: { from: previousRole, to: newRole } });
    return { uid: targetUid, role: newRole };
  }

  if (action === 'downgradeRole') {
    const downgrades = DOWNGRADE_PERMISSIONS[callerRole];
    const { targetUid } = request.data;
    if (!targetUid || !downgrades) throw new HttpsError('permission-denied', 'You cannot downgrade users.');
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
    const previousRole = targetSnap.data().role;
    const newRole = downgrades[previousRole];
    if (!newRole) throw new HttpsError('permission-denied', `A ${callerRole} cannot downgrade a ${previousRole}.`);
    if (callerRole === 'dealer' && previousRole === 'dealer' && targetSnap.data().dealerId !== callerUid) throw new HttpsError('permission-denied', 'You can only downgrade your own dealers.');
    await targetRef.update({ role: newRole });
    await logAudit({ action: 'role_downgraded', targetUid, performedBy: callerUid, performedByRole: callerRole, details: { from: previousRole, to: newRole } });
    return { uid: targetUid, role: newRole };
  }

  if (action === 'setFeatures') {
    if (callerRole !== 'admin' && callerRole !== 'superadmin') throw new HttpsError('permission-denied', 'Only admins can change feature access.');
    const { targetUid, features } = request.data;
    if (!targetUid || !features || typeof features !== 'object' || Array.isArray(features)) throw new HttpsError('invalid-argument', 'targetUid and features are required.');
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
    const targetRole = targetSnap.data().role;
    if (targetRole === 'superadmin' || (callerRole === 'admin' && targetRole === 'admin')) throw new HttpsError('permission-denied', 'You cannot change feature access for this account.');
    const cleanFeatures = {};
    for (const key of ['mobileBanking', 'recharge', 'remittance', 'travel', 'ticketReseller']) {
      if (Object.prototype.hasOwnProperty.call(features, key)) cleanFeatures[key] = Boolean(features[key]);
    }
    await targetRef.update({ features: cleanFeatures });
    await logAudit({ action: 'user_features_changed', targetUid, performedBy: callerUid, performedByRole: callerRole, details: { features: cleanFeatures } });
    return { uid: targetUid, features: cleanFeatures };
  }

  if (action === 'suspend') {
    if (callerRole !== 'superadmin') throw new HttpsError('permission-denied', 'Only a superadmin can suspend an account.');
    const { targetUid, suspended } = request.data;
    if (!targetUid || typeof suspended !== 'boolean') throw new HttpsError('invalid-argument', 'targetUid and suspended (true/false) are required.');
    if (targetUid === callerUid) throw new HttpsError('invalid-argument', 'You cannot suspend your own account.');
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
    if (targetSnap.data().role === 'superadmin') throw new HttpsError('permission-denied', 'A superadmin account cannot be suspended here.');
    try { await admin.auth().updateUser(targetUid, { disabled: suspended }); }
    catch (err) { await logServerError('manageUser.suspend', err, { userId: callerUid }); throw new HttpsError('internal', 'Could not update the account.'); }
    await targetRef.update(suspended ? { suspended: true, suspendedAt: admin.firestore.FieldValue.serverTimestamp(), suspendedBy: callerUid } : { suspended: false, suspendedAt: admin.firestore.FieldValue.delete(), suspendedBy: admin.firestore.FieldValue.delete() });
    await logAudit({ action: suspended ? 'user_suspended' : 'user_reactivated', targetUid, performedBy: callerUid, performedByRole: callerRole, details: {} });
    return { uid: targetUid, suspended };
  }

  if (action === 'delete') {
    if (callerRole !== 'superadmin') throw new HttpsError('permission-denied', 'Only a superadmin can delete an account.');
    const { targetUid } = request.data;
    if (!targetUid || targetUid === callerUid) throw new HttpsError('invalid-argument', 'A valid target account other than yourself is required.');
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
    const targetData = targetSnap.data();
    if (targetData.role === 'superadmin') throw new HttpsError('permission-denied', 'A superadmin account cannot be deleted here.');
    try { await admin.auth().deleteUser(targetUid); }
    catch (err) {
      if (err.code !== 'auth/user-not-found') { await logServerError('manageUser.delete', err, { userId: callerUid }); throw new HttpsError('internal', 'Could not delete the account.'); }
    }
    await targetRef.delete();
    await logAudit({ action: 'user_deleted', targetUid, performedBy: callerUid, performedByRole: callerRole, details: { role: targetData.role, name: targetData.name || null, phone: targetData.phone || null } });
    return { uid: targetUid, deleted: true };
  }

  throw new HttpsError('invalid-argument', 'Unknown user-management action.');
});
