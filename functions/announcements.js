// Admin "send announcement" - a manual, admin-triggered push broadcast.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');
const { checkVelocity, getClientIp } = require('./rateLimitService');
const { ENFORCE_APP_CHECK } = require('./appCheckPolicy');

const ADMIN_ROLES = ['admin', 'superadmin'];
const AUDIENCES = ['all', 'customer', 'dealer', 'reseller', 'support', 'finance', 'admin', 'superadmin'];
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 2000;
const MAX_PUSH_TOKEN_LENGTH = 256;
function chunk(arr, size) { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }
function activeAccount(user) { return user && user.suspended !== true && user.inactive !== true && user.disabled !== true && !user.mergedInto; }
function validExpoToken(token) { return typeof token === 'string' && token.length <= MAX_PUSH_TOKEN_LENGTH && /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token); }
async function sendExpoPush(messages) {
  const valid = messages.filter((m) => m && validExpoToken(m.to));
  if (valid.length === 0) return;
  for (const batch of chunk(valid, 100)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(batch.map((m) => ({ sound: 'default', ...m }))) });
      if (!res.ok) console.error('Expo push HTTP error', res.status, await res.text());
    } catch (e) { console.error('Expo push send failed', e); }
  }
}
exports.sendAnnouncement = onCall({ enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const db = admin.firestore();
  const callerUid = request.auth.uid;
  const callerSnap = await db.collection('users').doc(callerUid).get();
  const callerProfile = callerSnap.exists ? callerSnap.data() : null;
  if (!callerProfile || !ADMIN_ROLES.includes(callerProfile.role) || !activeAccount(callerProfile)) throw new HttpsError('permission-denied', 'Only an active admin can send announcements.');
  await checkVelocity(db, callerUid, 'announcement_send', { ip: getClientIp(request) });

  const { title, body, audience } = request.data || {};
  const titleText = typeof title === 'string' ? title.trim() : '';
  const bodyText = typeof body === 'string' ? body.trim() : '';
  if (!titleText || titleText.length > MAX_TITLE_LENGTH) throw new HttpsError('invalid-argument', `Title is required and must be at most ${MAX_TITLE_LENGTH} characters.`);
  if (!bodyText || bodyText.length > MAX_BODY_LENGTH) throw new HttpsError('invalid-argument', `Message is required and must be at most ${MAX_BODY_LENGTH} characters.`);
  if (!AUDIENCES.includes(audience)) throw new HttpsError('invalid-argument', 'Choose a valid audience.');

  try {
    const latestCallerSnap = await db.collection('users').doc(callerUid).get();
    const latestCaller = latestCallerSnap.exists ? latestCallerSnap.data() : null;
    if (!latestCaller || !ADMIN_ROLES.includes(latestCaller.role) || !activeAccount(latestCaller)) throw new HttpsError('permission-denied', 'This admin account is not active.');
    const usersQuery = audience === 'all' ? db.collection('users') : db.collection('users').where('role', '==', audience);
    const usersSnap = await usersQuery.get();
    const messages = [];
    let matched = 0;
    usersSnap.forEach((doc) => {
      const u = doc.data();
      if (!activeAccount(u)) return;
      matched += 1;
      if (!validExpoToken(u.pushToken) || (u.notifPrefs && u.notifPrefs.pushEnabled === false)) return;
      messages.push({ to: u.pushToken, title: titleText, body: bodyText, data: { type: 'announcement' } });
    });
    await sendExpoPush(messages);
    const logRef = await db.collection('announcements').add({ title: titleText, body: bodyText, audience, matchedCount: matched, sentCount: messages.length, sentBy: callerUid, sentByName: latestCaller.name || '', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await logAudit({ action: 'announcement_sent', targetUid: null, performedBy: callerUid, performedByRole: latestCaller.role, details: { audience, matchedCount: matched, sentCount: messages.length } });
    return { id: logRef.id, audience, matchedCount: matched, sentCount: messages.length };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('sendAnnouncement', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not send the announcement.');
  }
});
