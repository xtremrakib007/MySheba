const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { logAudit, logServerError } = require('./logService');

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;
const ALLOWED_ROLES = ['customer', 'dealer', 'reseller', 'admin', 'superadmin'];

function activeProfile(profile) {
  return !!profile && profile.suspended !== true && profile.inactive !== true && profile.disabled !== true && !profile.mergedInto;
}

exports.createSupportTicket = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const profileSnap = await db.collection('users').doc(uid).get();
  const profile = profileSnap.exists ? profileSnap.data() : null;
  if (!activeProfile(profile)) throw new HttpsError('permission-denied', 'Your account is not active.');
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
    await ref.create({
      userId: uid,
      userPhone: String(profile.phone || '').slice(0, 40),
      userName: String(profile.name || profile.displayName || '').slice(0, 160),
      userRole: role,
      subject,
      message,
      status: 'open',
      adminNote: '',
      assignedToUid: '',
      assignedToName: '',
      assignedToRole: '',
      createdAt: now,
      updatedAt: now,
    });
    await logAudit({ action: 'support_ticket_created', targetUid: uid, performedBy: uid, performedByRole: role, details: { ticketId: ref.id } });
    return { id: ref.id };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('createSupportTicket', err, { userId: uid });
    throw new HttpsError('internal', 'Could not create the support ticket.');
  }
});
