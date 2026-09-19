const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const TYPES = ['flight', 'bus', 'train'];
const MAX = { from: 160, to: 160, date: 40, time: 40, name: 160, phone: 40, email: 254, notes: 3000 };
function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function activeProfile(p) { return !!p && p.suspended !== true && p.inactive !== true && p.disabled !== true && !p.mergedInto; }
exports.createInquiry = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const profileSnap = await db.collection('users').doc(uid).get();
  const profile = profileSnap.exists ? profileSnap.data() : null;
  if (!activeProfile(profile)) throw new HttpsError('permission-denied', 'Your account is not active.');
  const data = request.data || {};
  const type = text(data.type, 20).toLowerCase();
  if (!TYPES.includes(type)) throw new HttpsError('invalid-argument', 'Invalid inquiry type.');
  const from = text(data.from, MAX.from), to = text(data.to, MAX.to), date = text(data.date, MAX.date);
  const time = text(data.time, MAX.time), name = text(data.name, MAX.name) || text(profile.name || profile.displayName, MAX.name);
  const phone = text(data.phone, MAX.phone) || text(profile.phone, MAX.phone);
  const email = text(data.email, MAX.email), notes = text(data.notes, MAX.notes);
  const passengers = Number(data.passengers);
  if (!from || !to || !date) throw new HttpsError('invalid-argument', 'Origin, destination, and date are required.');
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 50) throw new HttpsError('invalid-argument', 'Passengers must be between 1 and 50.');
  await checkVelocity(db, uid, 'inquiry_create', { ip: getClientIp(request) });
  const ref = db.collection('inquiries').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.create({ type, from, to, date, time, passengers, name, phone, email, notes, status: 'new', customerId: uid, createdAt: now, updatedAt: now });
  return { id: ref.id };
});
