const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assignUniqueUserId } = require('./userId');
const { logAudit, logServerError } = require('./logService');
const { inferWalletCurrency } = require('./walletCurrencyService');

const APP_EMAIL_DOMAIN = 'mysheba.app';
function normalizePhone(phone) { return String(phone || '').replace(/[^0-9]/g, ''); }
function phoneToEmail(phone) { return `${normalizePhone(phone)}@${APP_EMAIL_DOMAIN}`; }
function active(profile) { return !!profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && !profile.mergedInto && profile.active !== false; }
const ROLE_PERMISSIONS = { dealer: { canCreate: ['customer'], canUpgradeTo: [] }, admin: { canCreate: ['customer', 'dealer', 'reseller', 'support', 'finance'], canUpgradeTo: ['dealer', 'reseller', 'support', 'finance'] }, superadmin: { canCreate: ['customer', 'dealer', 'admin', 'reseller', 'support', 'finance'], canUpgradeTo: ['dealer', 'admin', 'reseller', 'support', 'finance'] }, support: { canCreate: [], canUpgradeTo: [] }, finance: { canCreate: [], canUpgradeTo: [] } };
const DOWNGRADE_PERMISSIONS = { dealer: { dealer: 'customer' }, admin: { dealer: 'customer', reseller: 'customer', support: 'customer', finance: 'customer' }, superadmin: { dealer: 'customer', admin: 'dealer', reseller: 'customer', support: 'customer', finance: 'customer' } };
async function getCallerProfile(uid) { const snap = await admin.firestore().collection('users').doc(uid).get(); return snap.exists ? { id: snap.id, ...snap.data() } : null; }
async function getCustomerTarget(db, targetUid) { const ref = db.collection('users').doc(targetUid); const snap = await ref.get(); if (!snap.exists) throw new HttpsError('not-found', 'That user does not exist.'); if (snap.data().role !== 'customer') throw new HttpsError('invalid-argument', 'Only a customer account can be changed here.'); return { ref, snap }; }
function assertActiveAssignment(profile, expectedRole, label) { if (!profile || profile.role !== expectedRole) throw new HttpsError('invalid-argument', `That ${label} was not found.`); if (!active(profile)) throw new HttpsError('failed-precondition', `That ${label} is not active.`); }

exports.manageUser = onCall({ enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const callerUid = request.auth.uid;
  const callerProfile = await getCallerProfile(callerUid);
  if (!active(callerProfile)) throw new HttpsError('permission-denied', 'Your account is not active.');
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
      else if (requestedDealerId) { const dealerSnap = await db.collection('users').doc(requestedDealerId).get(); assertActiveAssignment(dealerSnap.exists ? dealerSnap.data() : null, 'dealer', 'dealer'); dealerId = requestedDealerId; }
    }
    let resellerId = null;
    if (role === 'customer' && requestedResellerId && (callerRole === 'admin' || callerRole === 'superadmin')) { const resellerSnap = await db.collection('users').doc(requestedResellerId).get(); assertActiveAssignment(resellerSnap.exists ? resellerSnap.data() : null, 'reseller', 'reseller'); resellerId = requestedResellerId; }
    let userRecord;
    try { userRecord = await admin.auth().createUser({ email: phoneToEmail(phone), password: pin, displayName: name.trim() }); }
    catch (err) { if (err.code === 'auth/email-already-exists') throw new HttpsError('already-exists', 'An account with this phone number already exists.'); await logServerError('manageUser.create', err, { userId: callerUid }); throw new HttpsError('internal', 'Could not create the account.'); }
    const newProfile = { uid: userRecord.uid, userId: await assignUniqueUserId(db, userRecord.uid), name: name.trim(), phone: normalizePhone(phone), role, walletBalance: 0, walletCurrency: inferWalletCurrency({ phoneCountryCode: '+60' }), notifPrefs: { pushEnabled: true, emailEnabled: true, rateAlerts: false }, createdBy: callerUid, createdAt: admin.firestore.FieldValue.serverTimestamp() };
    if (dealerId) newProfile.dealerId = dealerId;
    if (resellerId) newProfile.resellerId = resellerId;
    try {
      await db.collection('users').doc(userRecord.uid).set(newProfile);
    } catch (err) {
      // Do not leave an Auth account without its Firestore profile. If the
      // profile write fails, roll back the newly-created identity.
      try {
        await admin.auth().deleteUser(userRecord.uid);
      } catch (rollbackErr) {
        await logServerError('manageUser.create.rollback', rollbackErr, { userId: callerUid, targetUid: userRecord.uid });
      }
      await logServerError('manageUser.create.profileWrite', err, { userId: callerUid, targetUid: userRecord.uid });
      throw new HttpsError('internal', 'Could not create the account.');
    }
    await logAudit({ action: 'account_created', targetUid: userRecord.uid, performedBy: callerUid, performedByRole: callerRole, details: { role, dealerId, resellerId } });
    return { uid: userRecord.uid, userId: newProfile.userId, name: name.trim(), phone: normalizePhone(phone), role, dealerId, resellerId };
  }

  if (action === 'setRole') {
    const { targetUid, newRole } = request.data;
    if (!targetUid || !newRole) throw new HttpsError('invalid-argument', 'targetUid and newRole are required.');
    if (!perms.canUpgradeTo.includes(newRole)) throw new HttpsError('permission-denied', `A ${callerRole} cannot upgrade a user to ${newRole}.`);
    const targetRef = db.collection('users').doc(targetUid);
    const callerRef = db.collection('users').doc(callerUid);
    const result = await db.runTransaction(async (tx) => {
      const [callerSnap, targetSnap] = await Promise.all([tx.get(callerRef), tx.get(targetRef)]);
      if (!callerSnap.exists || !active(callerSnap.data())) throw new HttpsError('permission-denied', 'Your account is not active.');
      const currentRole = callerSnap.data().role;
      const currentPerms = ROLE_PERMISSIONS[currentRole];
      if (!currentPerms || !currentPerms.canUpgradeTo.includes(newRole)) throw new HttpsError('permission-denied', 'You are no longer authorized to change this role.');
      if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
      const targetData = targetSnap.data();
      if (targetData.role !== 'customer') throw new HttpsError('permission-denied', 'Role upgrades are only allowed from customer accounts.');
      if (currentRole === 'dealer' && targetData.dealerId !== callerUid) throw new HttpsError('permission-denied', 'You can only upgrade your own customers.');
      tx.update(targetRef, { role: newRole });
      return { from: 'customer', role: newRole, performedByRole: currentRole };
    });
    await logAudit({ action: 'role_changed', targetUid, performedBy: callerUid, performedByRole: result.performedByRole, details: { from: result.from, to: result.role } });
    return { uid: targetUid, role: result.role };
  }

  if (action === 'setDealer') {
    const { targetUid, dealerId } = request.data;
    if (!targetUid || !dealerId) throw new HttpsError('invalid-argument', 'targetUid and dealerId are required.');
    const targetRef = db.collection('users').doc(targetUid);
    const dealerRef = db.collection('users').doc(dealerId);
    const callerRef = db.collection('users').doc(callerUid);
    const result = await db.runTransaction(async (tx) => {
      const [callerSnap, targetSnap, dealerSnap] = await Promise.all([tx.get(callerRef), tx.get(targetRef), tx.get(dealerRef)]);
      if (!callerSnap.exists || !active(callerSnap.data()) || !['admin', 'superadmin'].includes(callerSnap.data().role)) {
        throw new HttpsError('permission-denied', 'Your admin privileges are no longer active.');
      }
      if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
      if (targetSnap.data().role !== 'customer') throw new HttpsError('invalid-argument', 'Only a customer account can be changed here.');
      if (!dealerSnap.exists || dealerSnap.data().role !== 'dealer') throw new HttpsError('invalid-argument', 'That dealer was not found.');
      if (!active(dealerSnap.data())) throw new HttpsError('failed-precondition', 'That dealer is not active.');
      const previousDealerId = targetSnap.data().dealerId || null;
      tx.update(targetRef, { dealerId });
      return { previousDealerId, role: callerSnap.data().role };
    });
    await logAudit({ action: 'dealer_reassigned', targetUid, performedBy: callerUid, performedByRole: result.role, details: { from: result.previousDealerId, to: dealerId } });
    return { uid: targetUid, dealerId };
  }

  if (action === 'setReseller') {
    const { targetUid, resellerId } = request.data;
    if (!targetUid || !resellerId) throw new HttpsError('invalid-argument', 'targetUid and resellerId are required.');
    const targetRef = db.collection('users').doc(targetUid);
    const resellerRef = db.collection('users').doc(resellerId);
    const callerRef = db.collection('users').doc(callerUid);
    const result = await db.runTransaction(async (tx) => {
      const [callerSnap, targetSnap, resellerSnap] = await Promise.all([tx.get(callerRef), tx.get(targetRef), tx.get(resellerRef)]);
      if (!callerSnap.exists || !active(callerSnap.data()) || !['admin', 'superadmin'].includes(callerSnap.data().role)) {
        throw new HttpsError('permission-denied', 'Your admin privileges are no longer active.');
      }
      if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
      if (targetSnap.data().role !== 'customer') throw new HttpsError('invalid-argument', 'Only a customer account can be changed here.');
      if (!resellerSnap.exists || resellerSnap.data().role !== 'reseller') throw new HttpsError('invalid-argument', 'That reseller was not found.');
      if (!active(resellerSnap.data())) throw new HttpsError('failed-precondition', 'That reseller is not active.');
      const previousResellerId = targetSnap.data().resellerId || null;
      tx.update(targetRef, { resellerId });
      return { previousResellerId, role: callerSnap.data().role };
    });
    await logAudit({ action: 'reseller_reassigned', targetUid, performedBy: callerUid, performedByRole: result.role, details: { from: result.previousResellerId, to: resellerId } });
    return { uid: targetUid, resellerId };
  }

  if (action === 'downgradeRole') {
    const { targetUid } = request.data;
    if (!targetUid) throw new HttpsError('invalid-argument', 'targetUid is required.');
    const targetRef = db.collection('users').doc(targetUid);
    const callerRef = db.collection('users').doc(callerUid);
    const result = await db.runTransaction(async (tx) => {
      const [callerSnap, targetSnap] = await Promise.all([tx.get(callerRef), tx.get(targetRef)]);
      if (!callerSnap.exists || !active(callerSnap.data())) throw new HttpsError('permission-denied', 'Your account is not active.');
      const currentRole = callerSnap.data().role;
      const downgrades = DOWNGRADE_PERMISSIONS[currentRole];
      if (!downgrades) throw new HttpsError('permission-denied', 'You cannot downgrade users.');
      if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
      const target = targetSnap.data();
      const previousRole = target.role;
      const newRole = downgrades[previousRole];
      if (!newRole) throw new HttpsError('permission-denied', `A ${currentRole} cannot downgrade a ${previousRole}.`);
      if (currentRole === 'dealer' && previousRole === 'dealer' && target.dealerId !== callerUid) throw new HttpsError('permission-denied', 'You can only downgrade your own dealers.');
      tx.update(targetRef, { role: newRole });
      return { previousRole, newRole, role: currentRole };
    });
    await logAudit({ action: 'role_downgraded', targetUid, performedBy: callerUid, performedByRole: result.role, details: { from: result.previousRole, to: result.newRole } });
    return { uid: targetUid, role: result.newRole };
  }

  if (action === 'setFeatures') {
    const { targetUid, features } = request.data;
    if (!targetUid || !features || typeof features !== 'object' || Array.isArray(features)) throw new HttpsError('invalid-argument', 'targetUid and features are required.');
    const targetRef = db.collection('users').doc(targetUid);
    const callerRef = db.collection('users').doc(callerUid);
    const result = await db.runTransaction(async (tx) => {
      const [callerSnap, targetSnap] = await Promise.all([tx.get(callerRef), tx.get(targetRef)]);
      if (!callerSnap.exists || !active(callerSnap.data()) || !['admin', 'superadmin'].includes(callerSnap.data().role)) {
        throw new HttpsError('permission-denied', 'Your admin privileges are no longer active.');
      }
      if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
      const callerRoleNow = callerSnap.data().role;
      const targetRole = targetSnap.data().role;
      if (targetRole === 'superadmin' || (callerRoleNow === 'admin' && targetRole === 'admin')) throw new HttpsError('permission-denied', 'You cannot change feature access for this account.');
      const cleanFeatures = {};
      for (const key of ['mobileBanking', 'recharge', 'remittance', 'travel', 'ticketReseller']) if (Object.prototype.hasOwnProperty.call(features, key)) cleanFeatures[key] = Boolean(features[key]);
      tx.update(targetRef, { features: cleanFeatures });
      return { cleanFeatures, role: callerRoleNow };
    });
    await logAudit({ action: 'user_features_changed', targetUid, performedBy: callerUid, performedByRole: result.role, details: { features: result.cleanFeatures } });
    return { uid: targetUid, features: result.cleanFeatures };
  }

  if (action === 'suspend') {
    const { targetUid, suspended } = request.data;
    if (!targetUid || typeof suspended !== 'boolean') throw new HttpsError('invalid-argument', 'targetUid and suspended (true/false) are required.');
    if (targetUid === callerUid) throw new HttpsError('invalid-argument', 'You cannot suspend your own account.');
    const targetRef = db.collection('users').doc(targetUid);
    const callerRef = db.collection('users').doc(callerUid);
    const result = await db.runTransaction(async (tx) => {
      const [callerSnap, targetSnap] = await Promise.all([tx.get(callerRef), tx.get(targetRef)]);
      if (!callerSnap.exists || !active(callerSnap.data()) || callerSnap.data().role !== 'superadmin') {
        throw new HttpsError('permission-denied', 'Your superadmin privileges are no longer active.');
      }
      if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
      const targetData = targetSnap.data();
      if (targetData.role === 'superadmin') throw new HttpsError('permission-denied', 'A superadmin account cannot be suspended here.');
      return { role: callerSnap.data().role, targetRole: targetData.role, targetName: targetData.name || null, targetPhone: targetData.phone || null };
    });
    let authUpdated = false;
    try { await admin.auth().updateUser(targetUid, { disabled: suspended }); authUpdated = true; }
    catch (err) { await logServerError('manageUser.suspend', err, { userId: callerUid, targetUid }); throw new HttpsError('internal', 'Could not update the account.'); }
    try {
      await targetRef.update(suspended
        ? { suspended: true, suspendedAt: admin.firestore.FieldValue.serverTimestamp(), suspendedBy: callerUid, activeSessionId: null, activeDeviceId: null }
        : { suspended: false, suspendedAt: admin.firestore.FieldValue.delete(), suspendedBy: admin.firestore.FieldValue.delete() });
    } catch (err) {
      if (authUpdated) {
        try { await admin.auth().updateUser(targetUid, { disabled: !suspended }); }
        catch (rollbackErr) { await logServerError('manageUser.suspend.rollback', rollbackErr, { userId: callerUid, targetUid }); }
      }
      await logServerError('manageUser.suspend.profileWrite', err, { userId: callerUid, targetUid });
      throw new HttpsError('internal', 'Could not update the account.');
    }
    try { await admin.auth().revokeRefreshTokens(targetUid); }
    catch (err) { await logServerError('manageUser.suspend.revokeRefreshTokens', err, { userId: callerUid, targetUid }); }
    await logAudit({ action: suspended ? 'user_suspended' : 'user_reactivated', targetUid, performedBy: callerUid, performedByRole: result.role, details: {} });
    return { uid: targetUid, suspended };
  }

  if (action === 'delete') {
    const { targetUid } = request.data;
    if (!targetUid || targetUid === callerUid) throw new HttpsError('invalid-argument', 'A valid target account other than yourself is required.');
    const targetRef = db.collection('users').doc(targetUid);
    const callerRef = db.collection('users').doc(callerUid);
    const result = await db.runTransaction(async (tx) => {
      const [callerSnap, targetSnap] = await Promise.all([tx.get(callerRef), tx.get(targetRef)]);
      if (!callerSnap.exists || !active(callerSnap.data()) || callerSnap.data().role !== 'superadmin') {
        throw new HttpsError('permission-denied', 'Your superadmin privileges are no longer active.');
      }
      if (!targetSnap.exists) throw new HttpsError('not-found', 'That user does not exist.');
      const targetData = targetSnap.data();
      if (targetData.role === 'superadmin') throw new HttpsError('permission-denied', 'A superadmin account cannot be deleted here.');
      return { role: callerSnap.data().role, targetRole: targetData.role, targetName: targetData.name || null, targetPhone: targetData.phone || null };
    });
    try { await admin.auth().deleteUser(targetUid); }
    catch (err) {
      if (err.code !== 'auth/user-not-found') {
        await logServerError('manageUser.delete', err, { userId: callerUid, targetUid });
        throw new HttpsError('internal', 'Could not delete the account.');
      }
    }
    await targetRef.delete();
    await logAudit({ action: 'user_deleted', targetUid, performedBy: callerUid, performedByRole: result.role, details: { role: result.targetRole, name: result.targetName, phone: result.targetPhone } });
    return { uid: targetUid, deleted: true };
  }

  throw new HttpsError('invalid-argument', 'Unknown user-management action.');
});