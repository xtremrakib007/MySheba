const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { logAudit, logServerError } = require('./logService');

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;
const ALLOWED_ROLES = ['customer', 'dealer', 'reseller', 'admin', 'superadmin'];
const ASSIGNABLE_ROLES = ['admin', 'superadmin', 'dealer', 'reseller'];

function activeProfile(profile) {
  return !!profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && !profile.mergedInto;
}

async function getActiveActor(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  const profile = snap.exists ? snap.data() : null;
  if (!activeProfile(profile)) throw new HttpsError('permission-denied', 'Your account is not active.');
  return profile;
}

exports.createSupportTicket = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const profile = await getActiveActor(db, uid);
  const role = ALLOWED_ROLES.includes(profile.role) ? profile.role : 'customer';
  const subject = typeof request.data?.subject === 'string' ? request.data.subject.trim() : '';
  const message = typeof request.data?.message === 'string' ? request.data.message.trim() : '';
  if (!subject || subject.length > MAX_SUBJECT) throw new HttpsError('invalid-argument', 'Subject is required and must be at most 200 characters.');
  if (!message || message.length > MAX_MESSAGE) throw new HttpsError('invalid-argument', 'Message is required and must be at most 5000 characters.');
  const ip = getClientIp(request);
  await checkVelocity(db, uid, 'support_ticket_create', { ip });
  try {
    const ref = db.collection('supportTickets').doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.create({ userId: uid, userPhone: String(profile.phone || '').slice(0, 40), userName: String(profile.name || profile.displayName || '').slice(0, 160), userRole: role, subject, message, status: 'open', adminNote: '', assignedToUid: '', assignedToName: '', assignedToRole: '', createdAt: now, updatedAt: now });
    await logAudit({ action: 'support_ticket_created', targetUid: uid, performedBy: uid, performedByRole: role, details: { ticketId: ref.id } });
    return { id: ref.id };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('createSupportTicket', err, { userId: uid });
    throw new HttpsError('internal', 'Could not create the support ticket.');
  }
});

async function assertSuperadmin(db, uid) {
  const profile = await getActiveActor(db, uid);
  if (profile.role !== 'superadmin') throw new HttpsError('permission-denied', 'Only a superadmin can assign support tickets.');
  return profile;
}

async function setAssignment(request, clear) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  await assertSuperadmin(db, uid);
  const ticketId = String(request.data?.ticketId || '').trim();
  if (!ticketId || ticketId.length > 128) throw new HttpsError('invalid-argument', 'Ticket ID is required.');
  const ref = db.collection('supportTickets').doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Support ticket not found.');
  if (clear) {
    await ref.update({ assignedToUid: '', assignedToName: '', assignedToRole: '', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    await logAudit({ action: 'support_ticket_unassigned', targetUid: snap.data()?.userId || null, performedBy: uid, performedByRole: 'superadmin', details: { ticketId } });
    return { ok: true, ticketId };
  }
  const staffUid = String(request.data?.staffUid || '').trim();
  if (!staffUid || staffUid.length > 128) throw new HttpsError('invalid-argument', 'Staff account is required.');
  const staffSnap = await db.collection('users').doc(staffUid).get();
  if (!staffSnap.exists) throw new HttpsError('not-found', 'The selected staff account was not found.');
  const staff = staffSnap.data() || {};
  if (!activeProfile(staff) || !ASSIGNABLE_ROLES.includes(staff.role)) throw new HttpsError('failed-precondition', 'The selected staff account is not eligible for assignment.');
  await ref.update({ assignedToUid: staffUid, assignedToName: String(staff.name || staff.displayName || '').slice(0, 160), assignedToRole: staff.role, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await logAudit({ action: 'support_ticket_assigned', targetUid: snap.data()?.userId || null, performedBy: uid, performedByRole: 'superadmin', details: { ticketId, assignedToUid: staffUid, assignedToRole: staff.role } });
  return { ok: true, ticketId, assignedToUid: staffUid };
}

exports.assignSupportTicket = onCall({ enforceAppCheck: true }, async (request) => setAssignment(request, false));
exports.unassignSupportTicket = onCall({ enforceAppCheck: true }, async (request) => setAssignment(request, true));
