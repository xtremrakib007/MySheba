// Server-side user management: creating accounts and changing roles.
//
// This MUST live here and not in client code. firestore.rules deliberately
// freezes the `role` field on update (see the `users/{uid}` update rule) so
// a compromised or modified client can never self-promote. The Admin SDK
// used below is the only thing allowed to change `role` - and even here we
// re-check the caller's own role against ROLE_PERMISSIONS before doing
// anything, so e.g. a dealer calling this function directly can never
// upgrade themselves or someone else past what a dealer is allowed to do.
//
// Permission model (per MySheba's product spec):
//   dealer     -> can create customer accounts, and upgrade a customer to
//                 'dealer' (works under this dealer)
//   admin      -> can create accounts, and upgrade a customer to 'dealer'
//                 or 'reseller'
//   superadmin -> can create accounts, and upgrade to 'dealer', 'reseller'
//                 or 'admin'
//
// 'dealer' itself has no create/upgrade rights of its own - it's a
// managed tier under a dealer, not a manager.
//
// 'reseller' sits between customer and dealer in the mobile-banking/
// recharge/internet/remittance order flow: a customer registers under a
// reseller code (resellerId, resolved in functions/customerRegistration.js
// and functions/googleAuth.js, same shape as dealerId), their orders route
// to that reseller first, and the reseller manually forwards each one to a
// specific dealer (the 'setDealer' action below, reused for both admin's
// "Appoint Dealer" and a reseller forwarding their own order - see
// firestore.rules' isReseller() branch on transactions/{id}). Like dealer,
// a reseller has no create/upgrade rights of its own.
//
// Client call (see src/firebase/userManagementService.js):
//   const fn = httpsCallable(functions, 'manageUser');
//   await fn({ action: 'create', name, phone, pin, role: 'customer' });
//   await fn({ action: 'setRole', targetUid, newRole: 'dealer' });

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { assignUniqueUserId } = require('./userId');
const { logAudit, logServerError } = require('./logService');

const APP_EMAIL_DOMAIN = 'mysheba.app';

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}
function phoneToEmail(phone) {
  return `${normalizePhone(phone)}@${APP_EMAIL_DOMAIN}`;
}

// Which roles each caller role is allowed to hand out, either at account
// creation or when upgrading an existing user.
const ROLE_PERMISSIONS = {
  dealer: { canCreate: ['customer'], canUpgradeTo: [] },
  admin: { canCreate: ['customer', 'dealer', 'reseller'], canUpgradeTo: ['dealer', 'reseller'] },
  superadmin: { canCreate: ['customer', 'dealer', 'admin', 'reseller'], canUpgradeTo: ['dealer', 'admin', 'reseller'] },
};

// Reverse of the upgrade pairs above: which role each caller can demote,
// and what it falls back to. Mirrors canUpgradeTo exactly - e.g. a dealer
// can upgrade a customer to dealer, so a dealer can also downgrade that
// same dealer back to customer.
const DOWNGRADE_PERMISSIONS = {
  dealer: { dealer: 'customer' },
  admin: { dealer: 'customer', reseller: 'customer' },
  superadmin: { dealer: 'customer', admin: 'dealer', reseller: 'customer' },
};

async function getCallerProfile(uid) {
  const db = admin.firestore();
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

exports.manageUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerUid = request.auth.uid;
  const callerProfile = await getCallerProfile(callerUid);
  const callerRole = callerProfile && callerProfile.role;
  const perms = ROLE_PERMISSIONS[callerRole];
  if (!perms) {
    throw new HttpsError('permission-denied', 'Your account cannot manage users.');
  }

  const db = admin.firestore();
  const action = request.data && request.data.action;

  if (action === 'create') {
    const { name, phone, pin, role, dealerId: requestedDealerId, resellerId: requestedResellerId } = request.data;
    if (!name || !name.trim()) throw new HttpsError('invalid-argument', 'Name is required.');
    if (!phone || normalizePhone(phone).length < 8) {
      throw new HttpsError('invalid-argument', 'A valid phone number is required.');
    }
    if (String(pin || '').length < 6 || String(pin || '').length > 20) {
      throw new HttpsError('invalid-argument', 'Password must be 6-20 characters.');
    }
    if (!perms.canCreate.includes(role)) {
      throw new HttpsError('permission-denied', `A ${callerRole} cannot create a ${role} account.`);
    }

    // Every customer may optionally belong to a dealer - see "dealerId"
    // isolation on transactions and the users list. Resolve who that
    // dealer is (null is fine - see registerWithDealerCode.js for how an
    // unassigned customer's orders still reach Admin):
    //   - a dealer creating a customer -> always their own pool
    //   - an admin/superadmin creating a customer -> may name a dealer, or
    //     leave it unassigned (assignable later via the 'setDealer' action)
    let dealerId = null;
    if (role === 'customer') {
      if (callerRole === 'dealer') {
        dealerId = callerUid;
      } else if (requestedDealerId) {
        const dealerSnap = await db.collection('users').doc(requestedDealerId).get();
        if (!dealerSnap.exists || dealerSnap.data().role !== 'dealer') {
          throw new HttpsError('invalid-argument', 'That dealer was not found.');
        }
        dealerId = requestedDealerId;
      }
    }

    // Same pattern as dealerId above, but for the reseller a customer's
    // orders route to first - only an admin/superadmin naming one at
    // creation time; a dealer/dealer creating their own customer has no
    // say over that customer's reseller.
    let resellerId = null;
    if (role === 'customer' && requestedResellerId && (callerRole === 'admin' || callerRole === 'superadmin')) {
      const resellerSnap = await db.collection('users').doc(requestedResellerId).get();
      if (!resellerSnap.exists || resellerSnap.data().role !== 'reseller') {
        throw new HttpsError('invalid-argument', 'That reseller was not found.');
      }
      resellerId = requestedResellerId;
    }

    const email = phoneToEmail(phone);
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({ email, password: pin, displayName: name.trim() });
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'An account with this phone number already exists.');
      }
      await logServerError('manageUser.create', err, { userId: callerUid });
      throw new HttpsError('internal', 'Could not create the account.');
    }

    const newProfile = {
      uid: userRecord.uid,
      userId: await assignUniqueUserId(db, userRecord.uid),
      name: name.trim(),
      phone: normalizePhone(phone),
      role,
      walletBalance: 0,
      notifPrefs: { pushEnabled: true, emailEnabled: true, rateAlerts: false },
      createdBy: callerUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (dealerId) newProfile.dealerId = dealerId;
    if (resellerId) newProfile.resellerId = resellerId;
    await db.collection('users').doc(userRecord.uid).set(newProfile);

    await logAudit({
      action: 'account_created',
      targetUid: userRecord.uid,
      performedBy: callerUid,
      performedByRole: callerRole,
      details: { role, dealerId, resellerId },
    });

    return { uid: userRecord.uid, userId: newProfile.userId, name: name.trim(), phone: normalizePhone(phone), role, dealerId, resellerId };
  }

  if (action === 'setRole') {
    const { targetUid, newRole } = request.data;
    if (!targetUid || !newRole) {
      throw new HttpsError('invalid-argument', 'targetUid and newRole are required.');
    }
    if (!perms.canUpgradeTo.includes(newRole)) {
      throw new HttpsError('permission-denied', `A ${callerRole} cannot upgrade a user to ${newRole}.`);
    }
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'That user does not exist.');
    }
    // A dealer can only promote their own customer to dealer - never
    // another dealer's customer, or this would let dealers poach each
    // other's customer base.
    if (callerRole === 'dealer' && newRole === 'dealer') {
      if (targetSnap.data().dealerId !== callerUid) {
        throw new HttpsError('permission-denied', 'You can only upgrade your own customers.');
      }
    }
    const previousRole = targetSnap.data().role;
    await targetRef.update({ role: newRole });
    await logAudit({
      action: 'role_changed',
      targetUid,
      performedBy: callerUid,
      performedByRole: callerRole,
      details: { from: previousRole, to: newRole },
    });
    return { uid: targetUid, role: newRole };
  }

  if (action === 'setDealer') {
    // Assigns (or reassigns) which dealer a customer belongs to - the main
    // use case is a customer who self-registered with no dealer code, so
    // Admin picks one up later. Admin/superadmin only: a dealer moving a
    // customer to themselves would be poaching another dealer's customer.
    if (callerRole !== 'admin' && callerRole !== 'superadmin') {
      throw new HttpsError('permission-denied', 'Only an admin can assign a customer to a dealer.');
    }
    const { targetUid, dealerId: newDealerId } = request.data;
    if (!targetUid || !newDealerId) {
      throw new HttpsError('invalid-argument', 'targetUid and dealerId are required.');
    }
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'That user does not exist.');
    }
    if (targetSnap.data().role !== 'customer') {
      throw new HttpsError('invalid-argument', 'Only a customer account can be assigned to a dealer.');
    }
    const dealerSnap = await db.collection('users').doc(newDealerId).get();
    if (!dealerSnap.exists || dealerSnap.data().role !== 'dealer') {
      throw new HttpsError('invalid-argument', 'That dealer was not found.');
    }
    const previousDealerId = targetSnap.data().dealerId || null;
    await targetRef.update({ dealerId: newDealerId });
    await logAudit({
      action: 'dealer_reassigned',
      targetUid,
      performedBy: callerUid,
      performedByRole: callerRole,
      details: { from: previousDealerId, to: newDealerId },
    });
    return { uid: targetUid, dealerId: newDealerId };
  }

  if (action === 'setReseller') {
    // Assigns (or reassigns) which reseller a customer's dealer-queue
    // orders route to first - mirrors setDealer exactly, just for
    // resellerId instead of dealerId. Admin/superadmin only.
    if (callerRole !== 'admin' && callerRole !== 'superadmin') {
      throw new HttpsError('permission-denied', 'Only an admin can assign a customer to a reseller.');
    }
    const { targetUid, resellerId: newResellerId } = request.data;
    if (!targetUid || !newResellerId) {
      throw new HttpsError('invalid-argument', 'targetUid and resellerId are required.');
    }
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'That user does not exist.');
    }
    if (targetSnap.data().role !== 'customer') {
      throw new HttpsError('invalid-argument', 'Only a customer account can be assigned to a reseller.');
    }
    const resellerSnap = await db.collection('users').doc(newResellerId).get();
    if (!resellerSnap.exists || resellerSnap.data().role !== 'reseller') {
      throw new HttpsError('invalid-argument', 'That reseller was not found.');
    }
    const previousResellerId = targetSnap.data().resellerId || null;
    await targetRef.update({ resellerId: newResellerId });
    await logAudit({
      action: 'reseller_reassigned',
      targetUid,
      performedBy: callerUid,
      performedByRole: callerRole,
      details: { from: previousResellerId, to: newResellerId },
    });
    return { uid: targetUid, resellerId: newResellerId };
  }

  if (action === 'downgradeRole') {
    // Reverse of setRole above - demotes a user back to the role they held
    // before an upgrade (e.g. a dealer's dealer back to customer, or a
    // superadmin's admin back to dealer). Same escalation-boundary logic
    // as setRole: what a role can downgrade is exactly what it's allowed
    // to upgrade to in the first place.
    const downgrades = DOWNGRADE_PERMISSIONS[callerRole];
    const { targetUid } = request.data;
    if (!targetUid) {
      throw new HttpsError('invalid-argument', 'targetUid is required.');
    }
    if (!downgrades) {
      throw new HttpsError('permission-denied', `A ${callerRole} cannot downgrade users.`);
    }
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'That user does not exist.');
    }
    const previousRole = targetSnap.data().role;
    const newRole = downgrades[previousRole];
    if (!newRole) {
      throw new HttpsError('permission-denied', `A ${callerRole} cannot downgrade a ${previousRole}.`);
    }
    // Same "only your own pool" restriction as the upgrade path: a dealer
    // may only downgrade their own dealer, never one that belongs to
    // another dealer.
    if (callerRole === 'dealer' && previousRole === 'dealer') {
      if (targetSnap.data().dealerId !== callerUid) {
        throw new HttpsError('permission-denied', 'You can only downgrade your own dealers.');
      }
    }
    await targetRef.update({ role: newRole });
    await logAudit({
      action: 'role_downgraded',
      targetUid,
      performedBy: callerUid,
      performedByRole: callerRole,
      details: { from: previousRole, to: newRole },
    });
    return { uid: targetUid, role: newRole };
  }

  if (action === 'suspend') {
    // Blocks (or restores) an account's ability to sign in at all - unlike
    // every login attempt fails with auth/user-disabled (see
    // friendlyAuthError in src/firebase/authService.js) until reactivated.
    // "admin can touch anyone below staff tier" rule: suspending is a much
    // tier, and a superadmin can never suspend themselves or another
    // superadmin (that could lock every superadmin out of the platform
    // with nobody left who can undo it - only direct Firebase console
    // access could recover from that).
    if (callerRole !== 'superadmin') {
      throw new HttpsError('permission-denied', 'Only a superadmin can suspend an account.');
    }
    const { targetUid, suspended } = request.data;
    if (!targetUid || typeof suspended !== 'boolean') {
      throw new HttpsError('invalid-argument', 'targetUid and suspended (true/false) are required.');
    }
    if (targetUid === callerUid) {
      throw new HttpsError('invalid-argument', 'You cannot suspend your own account.');
    }
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'That user does not exist.');
    }
    if (targetSnap.data().role === 'superadmin') {
      throw new HttpsError('permission-denied', 'A superadmin account cannot be suspended here.');
    }
    try {
      await admin.auth().updateUser(targetUid, { disabled: suspended });
    } catch (err) {
      await logServerError('manageUser.suspend', err, { userId: callerUid });
      throw new HttpsError('internal', 'Could not update the account.');
    }
    await targetRef.update(
      suspended
        ? {
            suspended: true,
            suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
            suspendedBy: callerUid,
          }
        : {
            suspended: false,
            suspendedAt: admin.firestore.FieldValue.delete(),
            suspendedBy: admin.firestore.FieldValue.delete(),
          }
    );
    await logAudit({
      action: suspended ? 'user_suspended' : 'user_reactivated',
      targetUid,
      performedBy: callerUid,
      performedByRole: callerRole,
      details: {},
    });
    return { uid: targetUid, suspended };
  }

  if (action === 'delete') {
    // Permanently removes an account: the Firebase Auth user (so the phone
    // number/email is free to register again) and the users/{uid} profile
    // doc. Superadmin only, and irreversible - unlike suspend, there's no
    // toggle back. Same self/superadmin guard as suspend above, for the
    // same lockout-prevention reason.
    if (callerRole !== 'superadmin') {
      throw new HttpsError('permission-denied', 'Only a superadmin can delete an account.');
    }
    const { targetUid } = request.data;
    if (!targetUid) {
      throw new HttpsError('invalid-argument', 'targetUid is required.');
    }
    if (targetUid === callerUid) {
      throw new HttpsError('invalid-argument', 'You cannot delete your own account.');
    }
    const targetRef = db.collection('users').doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw new HttpsError('not-found', 'That user does not exist.');
    }
    const targetData = targetSnap.data();
    if (targetData.role === 'superadmin') {
      throw new HttpsError('permission-denied', 'A superadmin account cannot be deleted here.');
    }
    try {
      await admin.auth().deleteUser(targetUid);
    } catch (err) {
      // auth/user-not-found just means the Auth record is already gone
      // (e.g. a retry after a partial failure) - the Firestore doc still
      // needs cleaning up below, so don't fail the whole request over it.
      if (err.code !== 'auth/user-not-found') {
        await logServerError('manageUser.delete', err, { userId: callerUid });
        throw new HttpsError('internal', 'Could not delete the account.');
      }
    }
    await targetRef.delete();
    await logAudit({
      action: 'user_deleted',
      targetUid,
      performedBy: callerUid,
      performedByRole: callerRole,
      details: { role: targetData.role, name: targetData.name || null, phone: targetData.phone || null },
    });
    return { uid: targetUid, deleted: true };
  }

  throw new HttpsError('invalid-argument', 'Unknown action.');
});
